"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { queueDb, queueItemDb, slotDb, patientDb, db } from "@/lib/db/database";
import { doctorSettingsDb } from "@/lib/db/doctor-panel";
import type { QueueItem, QueueConfig, Slot } from "@/types";

export default function PatientViewPage() {
  const router = useRouter();
  
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [clinicName, setClinicName] = useState<string>("Clinic");
  const [doctorName, setDoctorName] = useState<string>("Dr.");
  const [queueStatus, setQueueStatus] = useState<string>("closed");
  const [tickerMessage, setTickerMessage] = useState<string>("");
  const [patientName, setPatientName] = useState<string>("");
  const [patientMobile, setPatientMobile] = useState<string>("");
  const [patientRegNo, setPatientRegNo] = useState<string>("");
  const [tokenNumber, setTokenNumber] = useState<string | null>(null);
  const [tickerSpeed, setTickerSpeed] = useState<number>(20);

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Play flight chime sound and announce token - ONLY PLAY ONCE
  const playChimeSound = useCallback((tokenNum: string) => {
    console.log('[PatientView] Playing chime for token:', tokenNum);
    
    // Load settings
    const queueSettings = localStorage.getItem('queueSettings');
    let settings = {
      enableChime: true,
      enableTextToSpeech: true,
      voiceGender: "female",
      delayBeforeSpeech: 0.5,
      useCustomChime: false,
      customChimeUrl: "",
    };
    
    if (queueSettings) {
      try {
        const parsed = JSON.parse(queueSettings);
        settings = { ...settings, ...parsed };
      } catch (e) {
        console.error('Failed to parse queue settings:', e);
      }
    }

    // Play chime if enabled
    if (settings.enableChime) {
      if (settings.useCustomChime && settings.customChimeUrl) {
        // Play custom chime once
        try {
          const audio = new Audio(settings.customChimeUrl);
          audio.volume = 1.0;
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => {
              console.error('Failed to play custom chime:', err.message);
            });
          }
        } catch (err) {
          console.error('Error playing custom chime:', err);
        }
      } else {
        // Play default chime using Web Audio API
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const now = audioContext.currentTime;
          
          // Flight chime pattern - two ascending tones
          const notes = [
            { freq: 800, duration: 0.15, delay: 0 },
            { freq: 1200, duration: 0.15, delay: 0.2 }
          ];
          
          notes.forEach(note => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.frequency.value = note.freq;
            osc.type = 'sine';
            
            gain.gain.setValueAtTime(0.8, now + note.delay);
            gain.gain.exponentialRampToValueAtTime(0.01, now + note.delay + note.duration);
            
            osc.start(now + note.delay);
            osc.stop(now + note.delay + note.duration);
          });
        } catch (err) {
          console.error('Error playing default chime:', err);
        }
      }
    }
    
    // Announce token if enabled
    if (settings.enableTextToSpeech) {
      const delayMs = (settings.delayBeforeSpeech || 0.5) * 1000;
      setTimeout(() => {
        announceToken(tokenNum, settings.voiceGender);
      }, delayMs);
    }
  }, []);

  // Announce token number in selected voice using Web Speech API
  const announceToken = (tokenNum: string, gender: string = "female", repeat: boolean = false) => {
    if ('speechSynthesis' in window) {
      // Cancel any previous speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(`Token number ${tokenNum}`);
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = gender === "female" ? 1.5 : 0.8; // Higher pitch for female, lower for male
      utterance.volume = 1.0; // Full volume
      
      // Try to use the selected voice
      const voices = window.speechSynthesis.getVoices();
      let selectedVoice = null;
      
      if (gender === "female") {
        selectedVoice = voices.find(voice => 
          voice.name.includes('Female') || 
          voice.name.includes('female') ||
          voice.name.includes('woman') ||
          voice.name.includes('Woman')
        );
      } else {
        selectedVoice = voices.find(voice => 
          voice.name.includes('Male') || 
          voice.name.includes('male') ||
          voice.name.includes('man') ||
          voice.name.includes('Man')
        );
      }
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
      
      window.speechSynthesis.speak(utterance);
      console.log('[PatientView] Announcing token:', tokenNum, 'with', gender, 'voice');
    }
  };

  const chimePlayedRef = useRef<string | null>(null);

  // Load queue data
  const loadQueueData = useCallback(() => {
    console.log('[PatientView] loadQueueData called');
    
    // Reload database from localStorage to get latest data from doctor panel
    db.reloadFromStorage();
    
    // Load clinic and doctor settings first
    const clinicNameSetting = doctorSettingsDb.get('clinicName');
    const doctorNameSetting = doctorSettingsDb.get('doctorName');
    if (clinicNameSetting) {
      setClinicName(clinicNameSetting);
    }
    if (doctorNameSetting) {
      setDoctorName(doctorNameSetting);
    }

    // Load ticker settings
    const queueSettings = localStorage.getItem('queueSettings');
    if (queueSettings) {
      try {
        const parsed = JSON.parse(queueSettings);
        setTickerMessage(parsed.tickerMessage || 'Welcome to our clinic. Please wait for your turn. Thank you for your patience.');
        setTickerSpeed(parsed.tickerSpeed || 20);
      } catch (e) {
        setTickerMessage('Welcome to our clinic. Please wait for your turn. Thank you for your patience.');
        setTickerSpeed(20);
      }
    } else {
      setTickerMessage('Welcome to our clinic. Please wait for your turn. Thank you for your patience.');
      setTickerSpeed(20);
    }

    // Now check for token display
    const doctorPanelPatient = typeof window !== 'undefined' ? localStorage.getItem('doctorPanelCurrentPatient') : null;
    const calledQueueItemId = typeof window !== 'undefined' ? localStorage.getItem('doctorPanelCalledQueueItemId') : null;
    
    console.log('[PatientView] doctorPanelCurrentPatient:', doctorPanelPatient);
    console.log('[PatientView] calledQueueItemId:', calledQueueItemId);
    
    // If doctor panel is empty, show WAIT
    if (!doctorPanelPatient || !calledQueueItemId) {
      console.log('[PatientView] Doctor panel empty or no queue item - showing WAIT');
      window.speechSynthesis.cancel();
      chimePlayedRef.current = null;
      setTokenNumber(null);
      setPatientName("");
      setPatientMobile("");
      setPatientRegNo("");
      
      // Set default queue status
      const storedStatus = typeof window !== 'undefined' ? localStorage.getItem('queueStatus') : null;
      setQueueStatus(storedStatus || 'closed');
      setSlot(null);
      return;
    }

    // Get the called queue item - just display the token number, no status checks
    const calledItem = queueItemDb.getById(calledQueueItemId) as QueueItem | undefined;
    console.log('[PatientView] calledItem:', calledItem);
    
    if (calledItem) {
      // Get the slot from the queue item
      const itemSlot = slotDb.getById(calledItem.slotId) as Slot | undefined;
      if (itemSlot) {
        setSlot(itemSlot);
      }
      
      // Get queue config status
      const queueConfig = queueDb.getById(calledItem.queueConfigId) as QueueConfig | undefined;
      if (queueConfig) {
        setQueueStatus(queueConfig.status);
      }
      
      // Display token number
      console.log('[PatientView] Displaying token:', calledItem.tokenNumber);
      const newToken = String(calledItem.tokenNumber || "");
      
      // Play chime ONLY if this is a NEW token (not played before)
      if (newToken !== chimePlayedRef.current) {
        console.log('[PatientView] New token detected, playing chime');
        playChimeSound(newToken);
        chimePlayedRef.current = newToken;
      }
      
      setTokenNumber(newToken);
      
      // Get patient details
      const patient = patientDb.getById(calledItem.patientId) as any;
      if (patient) {
        setPatientName(`${patient.firstName} ${patient.lastName}`);
        setPatientMobile(patient.mobileNumber || "");
        setPatientRegNo(patient.registrationNumber || "");
      }
    } else {
      // Queue item not found - clear the display
      console.log('[PatientView] Queue item not found - clearing display');
      window.speechSynthesis.cancel();
      chimePlayedRef.current = null;
      setTokenNumber(null);
      setPatientName("");
      setPatientMobile("");
      setPatientRegNo("");
      setSlot(null);
    }
  }, []);

  useEffect(() => {
    loadQueueData();
    
    // Listen for storage changes from other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'doctorPanelCurrentPatient' || e.key === 'doctorPanelCalledQueueItemId') {
        console.log('[PatientView] Storage changed from other tab - reloading data');
        loadQueueData();
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }
    
    // Also poll every 5 seconds as fallback (reduced from 500ms to prevent input lag)
    const interval = setInterval(loadQueueData, 5000);
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
      }
      clearInterval(interval);
    };
  }, [loadQueueData]);

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-blue-950 text-white px-8 py-4 border-b-4 border-yellow-400">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{clinicName}</h1>
            <p className="text-lg text-blue-200">{doctorName}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{currentTime}</div>
            <div className="text-sm text-blue-200">{currentDate}</div>
          </div>
        </div>
      </div>

      {/* Queue Status and Slot Info */}
      <div className="bg-blue-800 text-white px-8 py-3 flex justify-between items-center border-b-2 border-yellow-400">
        <div className="flex gap-8">
          <div>
            <span className="text-sm text-blue-200">Queue Status:</span>
            <span className={`ml-2 text-lg font-bold px-3 py-1 rounded-full ${
              queueStatus === "open" ? "bg-green-500" : "bg-red-500"
            }`}>
              {queueStatus.toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-sm text-blue-200">Slot:</span>
            <span className="ml-2 text-lg font-bold">{slot?.name || "N/A"}</span>
          </div>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="flex-1 flex flex-col px-8 py-8 pb-4">
        {tokenNumber && (typeof window !== 'undefined' ? localStorage.getItem('doctorPanelCurrentPatient') : null) ? (
          <div className="w-full h-full flex flex-col">
            {/* Patient Info - Left aligned, stacked vertically */}
            <div className="text-white">
              <p className="text-2xl font-bold">{patientName}</p>
              <p className="text-xl text-blue-100">Reg No: {patientRegNo}</p>
              <p className="text-xl text-blue-100">Mobile: {patientMobile}</p>
            </div>

            {/* Token Number Display - Centered, takes remaining space */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-3xl p-16 shadow-2xl border-8 border-white">
                  <div className="text-[22rem] font-black text-blue-900 drop-shadow-lg leading-none">
                    {tokenNumber}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-8">
              <div className="text-9xl font-black text-yellow-300 drop-shadow-lg animate-pulse">
                WAIT
              </div>
              <p className="text-white text-3xl font-semibold">No patient called yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Ticker Message at Bottom */}
      <div className="bg-yellow-400 text-blue-900 px-8 py-6 overflow-hidden border-t-4 border-yellow-500">
        <div 
          key={`ticker-${tickerSpeed}`}
          className="whitespace-nowrap text-2xl font-bold"
          style={{
            animation: `marquee ${tickerSpeed}s linear infinite`,
          }}
        >
          <span className="inline-block">{tickerMessage} • {tickerMessage} • {tickerMessage} • </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
}

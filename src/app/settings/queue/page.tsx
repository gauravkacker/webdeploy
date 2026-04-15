"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getCurrentUser } from "@/lib/permissions";

export default function QueueSettingsPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const defaultSettings = {
    autoCallNext: false,
    tokenPrefix: "Q",
    startingNumber: 1,
    resetDaily: true,
    showEstimatedWaitTime: true,
    averageConsultationTime: 15,
    tickerMessage: "Welcome to our clinic. Please wait for your turn. Thank you for your patience.",
    tickerSpeed: 20,
    // Token announcement settings
    enableChime: true,
    enableTextToSpeech: true,
    voiceGender: "female",
    playWhen: "on-call", // on-call, on-display, both
    repeatAnnouncement: false,
    repeatInterval: 5, // seconds
    delayBeforeSpeech: 0.5, // seconds after chime
    useCustomChime: false,
    customChimeUrl: "", // Base64 encoded audio or file URL
  };

  const [settings, setSettings] = useState(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load queue settings from localStorage
    const saved = localStorage.getItem('queueSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all fields are defined
        setSettings({ ...defaultSettings, ...parsed });
      } catch (e) {
        console.error('Failed to load queue settings:', e);
        setSettings(defaultSettings);
      }
    } else {
      setSettings(defaultSettings);
    }
    setIsLoaded(true);
  }, []);

  const handleSave = () => {
    localStorage.setItem('queueSettings', JSON.stringify(settings));
    alert('Queue settings saved successfully!');
  };

  const handleChimeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        
        // Check if it's MPEG format
        if (file.type === 'audio/mpeg' || file.name.match(/\.mpeg$/i)) {
          // For MPEG files, we'll try to use them directly
          // Modern browsers may support MPEG through different codecs
          console.log('MPEG file detected. Attempting to use directly. If playback fails, please convert to MP3 or WAV.');
        }
        
        setSettings({ ...settings, customChimeUrl: base64, useCustomChime: true });
        console.log('Custom chime uploaded:', file.name, 'Type:', file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const playTestChime = () => {
    if (settings.useCustomChime && settings.customChimeUrl) {
      // Play custom chime
      try {
        const audio = new Audio(settings.customChimeUrl);
        audio.volume = 1.0;
        
        // Add error handler
        audio.onerror = () => {
          console.error('Failed to play audio - format may not be supported');
          alert('Failed to play chime. Your browser may not support this audio format.\n\nIf using MPEG format:\n- Try converting to MP3 or WAV format\n- Use an online converter like CloudConvert or Zamzar\n- Or use FFmpeg command: ffmpeg -i input.mpeg -c:a libmp3lame output.mp3');
        };
        
        audio.oncanplay = () => {
          console.log('Audio loaded successfully');
        };
        
        audio.play().catch(err => {
          console.error('Failed to play custom chime:', err);
          if (err.name === 'NotSupportedError') {
            alert('Audio format not supported by your browser.\n\nIf using MPEG format:\n- Try converting to MP3 or WAV format\n- Use an online converter like CloudConvert or Zamzar\n- Or use FFmpeg command: ffmpeg -i input.mpeg -c:a libmp3lame output.mp3');
          } else {
            alert('Failed to play chime. Error: ' + err.message);
          }
        });
      } catch (err) {
        console.error('Error creating audio:', err);
        alert('Failed to play chime. Make sure the file is a valid audio format.');
      }
    } else {
      // Play default chime
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const now = audioContext.currentTime;
        
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
        alert('Failed to play chime.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        {!isLoaded ? (
          <div className="flex items-center justify-center h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="p-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Queue Configuration</h1>
              <p className="text-gray-500">Configure queue management and token settings</p>
            </div>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Token Settings</h2>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Token Prefix</label>
                  <input
                    type="text"
                    value={settings.tokenPrefix}
                    onChange={(e) => setSettings({ ...settings, tokenPrefix: e.target.value })}
                    placeholder="Q"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Prefix for token numbers (e.g., Q001, Q002)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starting Number</label>
                  <input
                    type="number"
                    value={settings.startingNumber}
                    onChange={(e) => setSettings({ ...settings, startingNumber: parseInt(e.target.value) || 1 })}
                    placeholder="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">First token number of the day</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.resetDaily}
                    onChange={(e) => setSettings({ ...settings, resetDaily: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Reset token numbers daily</span>
                </label>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 mb-4 mt-6">Queue Behavior</h2>
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.autoCallNext}
                    onChange={(e) => setSettings({ ...settings, autoCallNext: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Automatically call next patient when current consultation ends</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showEstimatedWaitTime}
                    onChange={(e) => setSettings({ ...settings, showEstimatedWaitTime: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Show estimated wait time to patients</span>
                </label>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Average Consultation Time (minutes)</label>
                <input
                  type="number"
                  value={settings.averageConsultationTime}
                  onChange={(e) => setSettings({ ...settings, averageConsultationTime: parseInt(e.target.value) || 15 })}
                  placeholder="15"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Used to calculate estimated wait times</p>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 mb-4 mt-6">Patient Display Settings</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker Message</label>
                <textarea
                  value={settings.tickerMessage}
                  onChange={(e) => setSettings({ ...settings, tickerMessage: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Enter message to display on patient view screen"
                />
                <p className="text-xs text-gray-500 mt-1">This message will scroll at the bottom of the patient display screen</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ticker Speed: {settings.tickerSpeed} seconds
                </label>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={settings.tickerSpeed}
                  onChange={(e) => setSettings({ ...settings, tickerSpeed: parseInt(e.target.value) })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Lower values = faster scrolling (5-60 seconds)</p>
              </div>

              <h2 className="text-lg font-semibold text-gray-900 mb-4 mt-6">Token Announcement Settings</h2>
              
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.enableChime}
                    onChange={(e) => setSettings({ ...settings, enableChime: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Enable chime sound when token is called</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.enableTextToSpeech}
                    onChange={(e) => setSettings({ ...settings, enableTextToSpeech: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Enable text-to-speech announcement</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.repeatAnnouncement}
                    onChange={(e) => setSettings({ ...settings, repeatAnnouncement: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Repeat announcement</span>
                </label>
              </div>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Custom Chime Sound</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.useCustomChime}
                      onChange={(e) => setSettings({ ...settings, useCustomChime: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Use custom chime sound</span>
                  </label>
                  
                  {settings.useCustomChime && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">Upload Chime File</label>
                      <p className="text-xs text-gray-600 mb-2">
                        <strong>Recommended formats:</strong> MP3, WAV, OGG, M4A<br/>
                        <strong>Note:</strong> MPEG files may not work in all browsers. If you have an MPEG file, convert it to MP3 first using:
                        <br/>• Online: CloudConvert.com or Zamzar.com
                        <br/>• Command line: <code className="bg-gray-200 px-1 rounded text-xs">ffmpeg -i input.mpeg -c:a libmp3lame output.mp3</code>
                      </p>
                      <input
                        key="chime-upload"
                        type="file"
                        accept="audio/*,.mp3,.wav,.ogg,.mpeg,.m4a,.aac,.flac"
                        onChange={handleChimeUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      <p className="text-xs text-gray-500">
                        {settings.customChimeUrl ? '✓ Chime uploaded' : 'No chime uploaded yet'}
                      </p>
                      <button 
                        type="button"
                        onClick={playTestChime}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm"
                      >
                        🔊 Test Chime
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voice Gender</label>
                  <select
                    value={settings.voiceGender}
                    onChange={(e) => setSettings({ ...settings, voiceGender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Play When</label>
                  <select
                    value={settings.playWhen}
                    onChange={(e) => setSettings({ ...settings, playWhen: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="on-call">On Call (immediately)</option>
                    <option value="on-display">On Display (when shown on screen)</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delay Before Speech (seconds)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={settings.delayBeforeSpeech}
                    onChange={(e) => setSettings({ ...settings, delayBeforeSpeech: parseFloat(e.target.value) || 0.5 })}
                    placeholder="0.5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Wait time after chime before speaking token number</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repeat Interval (seconds)</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={settings.repeatInterval}
                    onChange={(e) => setSettings({ ...settings, repeatInterval: parseInt(e.target.value) || 5 })}
                    placeholder="5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">How often to repeat announcement (if enabled)</p>
                </div>
              </div>

              <Button onClick={handleSave}>Save Queue Settings</Button>
            </Card>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

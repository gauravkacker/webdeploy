"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { internalMessageDb, messagingModuleUserDb } from "@/lib/db/internal-messaging";
import { db } from "@/lib/db/database";
import { playNotificationSound } from "@/lib/notification-sound";
import { getCurrentUser } from "@/lib/permissions";
import type { InternalMessage, MessagingModule } from "@/types";
import { Button } from "./ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";

export default function FloatingMessenger() {
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [isMinimized, setIsMinimized] = useState(true); // Default to minimized to avoid "stuck" state
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [currentModule, setCurrentModule] = useState<MessagingModule | null>(null);
  const [targetModule, setTargetModule] = useState<MessagingModule | "All">("All");
  const [isRecording, setIsRecording] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isEnabled, setIsEnabled] = useState(true);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [boxSize, setBoxSize] = useState({ width: 320, height: 400 });
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState({ x: 300, y: 20 });
  const [isDragging, setIsDragging] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startBottom: number; lastX?: number; lastY?: number } | null>(null);

  // Load user on mount
  useEffect(() => {
    const checkUser = () => {
      const currentUser = getCurrentUser();
      console.log('FloatingMessenger: Current user check', currentUser?.name);
      setUser(currentUser);
    };
    checkUser();
    const interval = setInterval(checkUser, 5000); // Check user every 5s in case of logout/login
    return () => clearInterval(interval);
  }, [setUser]);

  // Detect current module based on pathname
  useEffect(() => {
    const path = pathname.toLowerCase();
    if (path.includes("doctor-panel")) setCurrentModule("Doctor");
    else if (path.includes("appointments")) setCurrentModule("Appointments");
    else if (path.includes("pharmacy")) setCurrentModule("Pharmacy");
    else if (path.includes("billing")) setCurrentModule("Billing");
    else if (path.includes("settings/messaging")) setCurrentModule("Doctor");
    else if (path === "/" || path.includes("dashboard")) setCurrentModule("Doctor"); // Default to Doctor for main dashboard
    else setCurrentModule(null);
  }, [pathname]);

  // Load saved position for current module
  useEffect(() => {
    if (!currentModule) return;
    
    if (typeof window !== 'undefined') {
      const savedPosition = localStorage.getItem(`messagingPosition_${currentModule}`);
      if (savedPosition) {
        try {
          const pos = JSON.parse(savedPosition);
          setPosition(pos);
        } catch (e) {
          console.error("Failed to parse saved position:", e);
        }
      }
    }
  }, [currentModule]);

  // Sync messages and check if enabled
  const syncMessages = useCallback(() => {
    if (!currentModule || !user) return;

    let enabled = true;
    if (currentModule !== "Doctor") {
      enabled = messagingModuleUserDb.isModuleEnabled(currentModule);
    }
    
    setIsEnabled(enabled);

    const settings = db.getById('settings', 'messaging') as { readReceipts?: boolean } | undefined;
    setReadReceiptsEnabled(settings?.readReceipts ?? true);

    if (!enabled) return;

    const latestMessages = internalMessageDb.getByModule(currentModule);
    
    // Check for new messages to play sound
    if (latestMessages.length > messages.length) {
      const lastMessage = latestMessages[0];
      if (lastMessage.senderModule !== currentModule) {
        playNotificationSound();
      }
    }

    setMessages(latestMessages);
    setUnreadCount(latestMessages.filter(m => !m.isRead && m.senderModule !== currentModule).length);
    
    // Update last active
    messagingModuleUserDb.updateLastActive(currentModule);
  }, [currentModule, messages.length, user]);

  useEffect(() => {
    syncMessages();
    const interval = setInterval(syncMessages, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [syncMessages]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('messenger_minimized', isMinimized.toString());
    }
  }, [isMinimized, setIsMinimized]);

  // Scroll to bottom when messages change or box opens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isMinimized]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !currentModule) return;

    internalMessageDb.create({
      senderModule: currentModule,
      receiverModule: targetModule,
      content: inputText,
      type: "text",
    });

    setInputText("");
    syncMessages();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          if (currentModule) {
            internalMessageDb.create({
              senderModule: currentModule,
              receiverModule: targetModule,
              content: "Audio Message",
              type: "audio",
              audioUrl: base64Audio,
            });
            syncMessages();
          }
        };
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: boxSize.width,
      startHeight: boxSize.height,
    };
    e.preventDefault();
  };

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: position.x,
      startBottom: position.y,
      lastX: 0,
      lastY: 0,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;
      
      const deltaX = e.clientX - resizeRef.current.startX;
      const deltaY = resizeRef.current.startY - e.clientY;
      
      setBoxSize({
        width: Math.max(250, resizeRef.current.startWidth + deltaX),
        height: Math.max(300, resizeRef.current.startHeight + deltaY),
      });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = -(e.clientY - dragRef.current.startY); // Negate Y because bottom increases upward
      
      dragRef.current.lastX = deltaX;
      dragRef.current.lastY = deltaY;
      
      const newPosition = {
        x: dragRef.current.startLeft + deltaX,
        y: dragRef.current.startBottom + deltaY,
      };
      
      setPosition(newPosition);
    };

    const handleMouseUp = () => {
      if (isDragging && dragRef.current && currentModule) {
        // Save final position to localStorage
        const finalPosition = {
          x: dragRef.current.startLeft + (dragRef.current.lastX || 0),
          y: dragRef.current.startBottom + (dragRef.current.lastY || 0),
        };
        localStorage.setItem(`messagingPosition_${currentModule}`, JSON.stringify(finalPosition));
      }
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, currentModule]);

  // Global click listener for debug
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // console.log('FloatingMessenger: Global Click Detected at', e.clientX, e.clientY);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  if (!user || !currentModule || !isEnabled) {
    return null;
  }

  return (
    <div 
      style={{ 
        position: 'fixed', 
        bottom: `${position.y}px`, 
        left: `${position.x}px`, 
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'none'
      }}
    >
      {/* Floating Bubble */}
      {isMinimized ? (
        <button
          type="button"
          onMouseDown={handleDragStart}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('FloatingMessenger: Opening Box (Explicit Left Position)');
            if (currentModule) {
              internalMessageDb.markAllAsRead(currentModule);
              syncMessages();
            }
            setIsMinimized(false);
          }}
          className="w-14 h-14 bg-blue-600 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-blue-700 transition-all transform hover:scale-105 relative cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center border-2 border-white">
              {unreadCount}
            </span>
          )}
        </button>
      ) : (
        /* Messaging Box */
        <div 
          className="bg-white rounded-lg shadow-2xl flex flex-col border border-gray-200 overflow-hidden relative"
          style={{ width: boxSize.width, height: boxSize.height }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Resize handle (top-right for bottom-left fixed box) */}
          <div 
            onMouseDown={handleResizeStart}
            className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-10"
          />

          <CardHeader 
            className="p-3 bg-blue-600 text-white flex flex-row items-center justify-between space-y-0 cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleDragStart}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <CardTitle className="text-sm font-bold">Internal: {currentModule}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('FloatingMessenger: Minimizing Box');
                  setIsMinimized(true);
                }}
                className="p-1 hover:bg-blue-500 rounded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </CardHeader>

          <div className="flex-1 flex flex-col p-0 bg-gray-50 overflow-hidden">
            {/* Target Selector */}
            <div className="p-2 border-b bg-white flex gap-2">
              <span className="text-xs text-gray-500 self-center">To:</span>
              <select 
                value={targetModule}
                onChange={(e) => setTargetModule(e.target.value as any)}
                className="text-xs border rounded px-1 py-0.5 flex-1"
              >
                <option value="All">Everyone</option>
                {["Doctor", "Appointments", "Pharmacy", "Billing"].filter(m => m !== currentModule).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Messages Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-3 space-y-3"
            >
              {messages.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-xs text-gray-400 italic">No messages yet</p>
                </div>
              ) : (
                messages.slice().reverse().map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${msg.senderModule === currentModule ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[10px] font-bold text-gray-500">{msg.senderModule}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div 
                      className={`max-w-[85%] p-2 rounded-lg text-sm shadow-sm ${
                        msg.senderModule === currentModule 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
                      }`}
                    >
                      {msg.type === "text" ? (
                        <p className="break-words">{msg.content}</p>
                      ) : (
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <audio src={msg.audioUrl} controls className="h-6 w-full max-w-[150px] scale-75 origin-left" />
                        </div>
                      )}
                    </div>
                    {msg.senderModule === currentModule && (currentModule === "Doctor" || readReceiptsEnabled) && (
                      <div className="text-xs text-gray-400 mt-1">
                        {msg.isRead ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Smart Quick Replies */}
            <div className="px-2 py-1 flex gap-1 overflow-x-auto no-scrollbar bg-white border-t">
              {["Okay", "Done", "On it", "Urgent", "Call me"].map(reply => (
                <button
                  key={reply}
                  onClick={() => {
                    internalMessageDb.create({
                      senderModule: currentModule,
                      receiverModule: targetModule,
                      content: reply,
                      type: "text",
                    });
                    syncMessages();
                  }}
                  className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full whitespace-nowrap text-gray-600 transition-colors"
                >
                  {reply}
                </button>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-2 bg-white border-t flex items-center gap-2">
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                className={`p-2 rounded-full transition-colors ${
                  isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Hold to record audio"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              </button>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 text-sm border-none focus:ring-0 p-1 bg-transparent"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim()}
                className="p-2 text-blue-600 hover:text-blue-700 disabled:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

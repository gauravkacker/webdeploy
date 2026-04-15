"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface PhotoUploadProps {
  currentPhotoUrl?: string;
  onPhotoUploaded: (photoUrl: string) => void;
  patientName: string;
}

export function PhotoUpload({ currentPhotoUrl, onPhotoUploaded, patientName }: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload from computer
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    await uploadPhoto(objectUrl);
  };

  // Start camera
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access camera. Please check permissions.");
      setShowCamera(false);
    }
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photoUrl = canvas.toDataURL("image/jpeg", 0.8);
        stopCamera();
        uploadPhoto(photoUrl);
      }
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  // Upload photo (compress and save)
  const uploadPhoto = async (photoUrl: string) => {
    setIsUploading(true);
    try {
      const compressed = await compressImage(photoUrl, 200, 200, 0.7);
      onPhotoUploaded(compressed);
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Remove photo
  const handleRemovePhoto = () => {
    if (confirm("Are you sure you want to remove the profile photo?")) {
      onPhotoUploaded("");
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Photo Circle */}
      <div className="relative">
        {currentPhotoUrl ? (
          <img
            src={currentPhotoUrl}
            alt={`${patientName}'s photo`}
            className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center border-2 border-gray-200">
            <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
        
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          </div>
        )}
      </div>

      {/* Compact Action Buttons */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          📷 Upload
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={startCamera}
          disabled={isUploading}
        >
          📸 Camera
        </Button>
        {currentPhotoUrl && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRemovePhoto}
            disabled={isUploading}
          >
            🗑️
          </Button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <Card className="p-4 max-w-md w-full">
            <h3 className="text-lg font-medium mb-4">Take Photo</h3>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg bg-gray-100"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-2 mt-4">
              <Button variant="primary" onClick={capturePhoto}>
                📸 Capture
              </Button>
              <Button variant="secondary" onClick={stopCamera}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Helper function to compress image
function compressImage(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        reject(new Error("Could not get canvas context"));
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

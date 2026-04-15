"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getCurrentUser } from "@/lib/permissions";

export default function ClinicDoctorSettingsPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [settings, setSettings] = useState({
    clinicName: "",
    clinicAddress: "",
    clinicPhone: "",
    clinicEmail: "",
    clinicRegistration: "",
    doctorName: "",
    doctorQualification: "",
    doctorLicense: "",
    doctorSpecialization: "",
    doctorExperience: "",
    doctorPhone: "",
    doctorEmail: "",
  });

  // Load settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("clinicDoctorSettings");
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      console.log('[Clinic Settings] Saving settings:', settings);
      localStorage.setItem("clinicDoctorSettings", JSON.stringify(settings));
      console.log('[Clinic Settings] Settings saved successfully');
      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (error) {
      setSaveMessage("Failed to save settings");
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Clinic & Doctor Settings</h1>
              <p className="text-sm text-gray-500 mt-1">
                Configure your clinic and doctor information
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-4xl">
          {saveMessage && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              {saveMessage}
            </div>
          )}

          {/* Clinic Information */}
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Clinic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clinic Name
                </label>
                <Input
                  type="text"
                  name="clinicName"
                  value={settings.clinicName}
                  onChange={handleChange}
                  placeholder="Enter clinic name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registration Number
                </label>
                <Input
                  type="text"
                  name="clinicRegistration"
                  value={settings.clinicRegistration}
                  onChange={handleChange}
                  placeholder="Enter clinic registration number"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <textarea
                  name="clinicAddress"
                  value={settings.clinicAddress}
                  onChange={handleChange}
                  placeholder="Enter clinic address"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  name="clinicPhone"
                  value={settings.clinicPhone}
                  onChange={handleChange}
                  placeholder="Enter clinic phone number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  name="clinicEmail"
                  value={settings.clinicEmail}
                  onChange={handleChange}
                  placeholder="Enter clinic email"
                />
              </div>
            </div>
          </Card>

          {/* Doctor Information */}
          <Card className="p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Doctor Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Doctor Name
                </label>
                <Input
                  type="text"
                  name="doctorName"
                  value={settings.doctorName}
                  onChange={handleChange}
                  placeholder="Enter doctor name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  License Number
                </label>
                <Input
                  type="text"
                  name="doctorLicense"
                  value={settings.doctorLicense}
                  onChange={handleChange}
                  placeholder="Enter license number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Qualification
                </label>
                <Input
                  type="text"
                  name="doctorQualification"
                  value={settings.doctorQualification}
                  onChange={handleChange}
                  placeholder="e.g., BHMS, MD (Homeopathy)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Specialization
                </label>
                <Input
                  type="text"
                  name="doctorSpecialization"
                  value={settings.doctorSpecialization}
                  onChange={handleChange}
                  placeholder="e.g., Homeopathic Physician"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Years of Experience
                </label>
                <Input
                  type="text"
                  name="doctorExperience"
                  value={settings.doctorExperience}
                  onChange={handleChange}
                  placeholder="e.g., 10 years"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  name="doctorPhone"
                  value={settings.doctorPhone}
                  onChange={handleChange}
                  placeholder="Enter doctor phone number"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  name="doctorEmail"
                  value={settings.doctorEmail}
                  onChange={handleChange}
                  placeholder="Enter doctor email"
                />
              </div>
            </div>
          </Card>

          {/* Preview */}
          <Card className="p-6 mb-6 bg-blue-50 border-blue-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Clinic:</span>
                <span className="text-gray-600 ml-2">{settings.clinicName || "Not set"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Doctor:</span>
                <span className="text-gray-600 ml-2">{settings.doctorName || "Not set"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Qualification:</span>
                <span className="text-gray-600 ml-2">{settings.doctorQualification || "Not set"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Address:</span>
                <span className="text-gray-600 ml-2">{settings.clinicAddress || "Not set"}</span>
              </div>
            </div>
          </Card>

          {/* Save Button */}
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.history.back()}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

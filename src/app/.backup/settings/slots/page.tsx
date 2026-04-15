"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { slotDb } from "@/lib/db/database";
import type { Slot } from "@/types";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STORAGE_KEY = "clinicScheduleSettings";

interface ScheduleSettings {
  openDays: number[];           // 0=Sun … 6=Sat
  customHolidays: string[];     // YYYY-MM-DD
  dateOverrides: { date: string; slotId: string | "all" }[]; // per-date slot holidays
}

const defaultSchedule: ScheduleSettings = {
  openDays: [1, 2, 3, 4, 5, 6], // Mon–Sat open by default
  customHolidays: [],
  dateOverrides: [],
};

export default function SlotSettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    startTime: "09:00",
    endTime: "13:00",
    maxTokens: 20,
    duration: 10,
    tokenReset: true,
    isActive: true,
    displayOrder: 0,
  });

  // Schedule / holiday state
  const [schedule, setSchedule] = useState<ScheduleSettings>(defaultSchedule);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideSlot, setNewOverrideSlot] = useState<string>("all");

  const loadSlots = useCallback(() => {
    setIsLoading(true);
    const allSlots = slotDb.getAll() as Slot[];
    const sortedSlots = allSlots.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    setSlots(sortedSlots);
    setIsLoading(false);
  }, []);

  useEffect(() => {
     
    loadSlots();
  }, [loadSlots]);

  // Load schedule settings
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSchedule({ ...defaultSchedule, ...JSON.parse(saved) });
    } catch { /* ignore */ }
  }, []);

  const saveSchedule = (updated: ScheduleSettings) => {
    setSchedule(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setScheduleSaved(true);
    setTimeout(() => setScheduleSaved(false), 2000);
  };

  const toggleDay = (day: number) => {
    const openDays = schedule.openDays.includes(day)
      ? schedule.openDays.filter(d => d !== day)
      : [...schedule.openDays, day].sort();
    saveSchedule({ ...schedule, openDays });
  };

  const addCustomHoliday = () => {
    if (!newHolidayDate) return;
    if (schedule.customHolidays.includes(newHolidayDate)) { setNewHolidayDate(""); return; }
    saveSchedule({ ...schedule, customHolidays: [...schedule.customHolidays, newHolidayDate].sort() });
    setNewHolidayDate("");
  };

  const removeCustomHoliday = (date: string) => {
    saveSchedule({ ...schedule, customHolidays: schedule.customHolidays.filter(d => d !== date) });
  };

  const addDateOverride = () => {
    if (!newOverrideDate) return;
    const exists = schedule.dateOverrides.find(o => o.date === newOverrideDate && o.slotId === newOverrideSlot);
    if (exists) { setNewOverrideDate(""); return; }
    saveSchedule({
      ...schedule,
      dateOverrides: [...schedule.dateOverrides, { date: newOverrideDate, slotId: newOverrideSlot }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
    setNewOverrideDate("");
  };

  const removeDateOverride = (date: string, slotId: string) => {
    saveSchedule({
      ...schedule,
      dateOverrides: schedule.dateOverrides.filter(o => !(o.date === date && o.slotId === slotId)),
    });
  };

  const handleCreate = () => {
    setIsCreating(true);
    setEditingSlot(null);
    setFormData({
      name: "",
      startTime: "09:00",
      endTime: "13:00",
      maxTokens: 20,
      duration: 10,
      tokenReset: true,
      isActive: true,
      displayOrder: slots.length,
    });
  };

  const handleEdit = (slot: Slot) => {
    setEditingSlot(slot);
    setFormData({
      name: slot.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      maxTokens: slot.maxTokens,
      duration: slot.duration || 10,
      tokenReset: slot.tokenReset,
      isActive: slot.isActive,
      displayOrder: slot.displayOrder || 0,
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert("Please enter a slot name");
      return;
    }

    if (editingSlot) {
      slotDb.update(editingSlot.id, formData);
    } else {
      slotDb.create({
        name: formData.name,
        startTime: formData.startTime,
        endTime: formData.endTime,
        maxTokens: formData.maxTokens,
        duration: formData.duration,
        tokenReset: formData.tokenReset,
        isActive: formData.isActive,
        displayOrder: formData.displayOrder,
      } as unknown as Parameters<typeof slotDb.create>[0]);
    }

    setEditingSlot(null);
    setIsCreating(false);
    loadSlots();
  };

  const handleDelete = (slotId: string) => {
    if (confirm("Delete this slot? Existing appointments will not be affected.")) {
      slotDb.delete(slotId);
      loadSlots();
    }
  };

  const handleToggleActive = (slotId: string) => {
    slotDb.toggleActive(slotId);
    loadSlots();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        <div className="p-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Slot Configuration</h1>
              <p className="text-gray-500">Configure appointment slots for your clinic</p>
            </div>

            {/* Clinic Days Card */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Clinic Days</h2>
                  <p className="text-sm text-gray-500">Select open days — unselected days are treated as weekly holidays</p>
                </div>
                {scheduleSaved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
              </div>

              {/* Day toggles */}
              <div className="flex flex-wrap gap-2 mb-6">
                {DAYS.map((day, idx) => {
                  const isOpen = schedule.openDays.includes(idx);
                  return (
                    <button
                      key={day}
                      onClick={() => toggleDay(idx)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                        isOpen
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-gray-300 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {day.slice(0, 3)}
                      {!isOpen && <span className="ml-1 text-xs opacity-70">off</span>}
                    </button>
                  );
                })}
              </div>

              {/* Custom holiday picker */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Custom Holidays</h3>
                <p className="text-xs text-gray-500 mb-3">Add specific dates that are holidays regardless of the day of week</p>
                <div className="flex gap-2 mb-3">
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={e => setNewHolidayDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Button onClick={addCustomHoliday} disabled={!newHolidayDate}>Add Holiday</Button>
                </div>
                {schedule.customHolidays.length === 0 ? (
                  <p className="text-xs text-gray-400">No custom holidays added</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {schedule.customHolidays.map(date => (
                      <span key={date} className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 border border-red-200 text-red-700 rounded-full text-xs">
                        {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <button onClick={() => removeCustomHoliday(date)} className="ml-1 hover:text-red-900 font-bold">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Date Overrides Card */}
            <Card className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Date Overrides</h2>
                <p className="text-sm text-gray-500">Mark a specific date as holiday for all slots or a particular slot</p>
              </div>

              <div className="flex flex-wrap gap-2 mb-4 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={newOverrideDate}
                    onChange={e => setNewOverrideDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Slot</label>
                  <select
                    value={newOverrideSlot}
                    onChange={e => setNewOverrideSlot(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="all">All Slots</option>
                    {slots.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={addDateOverride} disabled={!newOverrideDate}>+ Add Holiday</Button>
              </div>

              {schedule.dateOverrides.length === 0 ? (
                <p className="text-xs text-gray-400">No date overrides added</p>
              ) : (
                <div className="space-y-2">
                  {schedule.dateOverrides.map(o => {
                    const slotName = o.slotId === "all"
                      ? "All Slots"
                      : slots.find(s => s.id === o.slotId)?.name || o.slotId;
                    return (
                      <div key={`${o.date}-${o.slotId}`} className="flex items-center justify-between px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-800">
                            {new Date(o.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">{slotName}</span>
                        </div>
                        <button onClick={() => removeDateOverride(o.date, o.slotId)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Slot List */}
            <div className="grid gap-4">
              {slots.length === 0 ? (
                <Card className="p-8 text-center">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No slots configured</h3>
                  <p className="text-gray-500 mb-4">Create your first time slot to start booking appointments</p>
                  <Button onClick={handleCreate}>Create Slot</Button>
                </Card>
              ) : (
                slots.map((slot) => {
                  const s = slot as Slot;
                  return (
                    <Card key={s.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                            {s.displayOrder + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900">{s.name}</h3>
                              <Badge variant={s.isActive ? "success" : "default"}>
                                {s.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                              {s.startTime} - {s.endTime} • Max {s.maxTokens} tokens
                              {s.tokenReset && " • Token resets"}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleEdit(s)}>
                            Edit
                          </Button>
                          <Button
                            variant={s.isActive ? "secondary" : "primary"}
                            size="sm"
                            onClick={() => handleToggleActive(s.id)}
                          >
                            {s.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(s.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Add/Edit Form */}
            {(editingSlot || isCreating) && !isLoading && (
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingSlot ? "Edit Slot" : "Create New Slot"}
                </h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slot Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Morning, Evening"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                    <Input
                      type="number"
                      value={formData.displayOrder}
                      onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <Input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
                    <Input
                      type="number"
                      value={formData.maxTokens}
                      onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 20 })}
                    />
                  </div>
                </div>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.tokenReset}
                      onChange={(e) => setFormData({ ...formData, tokenReset: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Reset token numbering for this slot</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave}>{editingSlot ? "Update" : "Create"} Slot</Button>
                  <Button variant="secondary" onClick={() => {
                    setEditingSlot(null);
                    setIsCreating(false);
                  }}>
                    Cancel
                  </Button>
                </div>
              </Card>
            )}

            {/* Add Slot Button */}
            {!editingSlot && !isCreating && slots.length > 0 && (
              <Button onClick={handleCreate}>Add Another Slot</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

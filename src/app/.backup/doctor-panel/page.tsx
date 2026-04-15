"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TimeDisplay } from '@/components/layout/TimeDisplay';
import { getCurrentUser } from '@/lib/permissions';
import { useDebounce } from '@/hooks/useDebounce';
import { patientDb, appointmentDb, billingQueueDb, feeDb, feesDb, queueItemDb, slotDb, queueDb, investigationDb } from '@/lib/db/database';
import { feeHistoryDb } from '@/lib/db/database';
import { doctorVisitDb, doctorPrescriptionDb, pharmacyQueueDb, doctorSettingsDb } from '@/lib/db/doctor-panel';
import { db } from '@/lib/db/database';
import type { Patient, Appointment, FeeHistoryEntry, QueueItem, QueueConfig, Slot } from '@/types';
import type { DoctorVisit, PharmacyQueueItem } from '@/lib/db/schema';
import { printPrescriptionToPharmacy } from '@/lib/prescription-thermal-printer';

// Local types for Doctor Panel (simpler for UI state)
interface PatientRecord {
  id: string;
  firstName: string;
  lastName: string;
  mobile: string;
  registrationNumber: string;
  age?: number;
  gender?: string;
}

interface Visit {
  id: string;
  patientId: string;
  visitDate: Date;
  visitNumber: number;
  chiefComplaint?: string;
  caseText?: string;
  diagnosis?: string;
  advice?: string;
  testsRequired?: string;
  nextVisit?: Date;
  prognosis?: string;
  remarksToFrontdesk?: string;
  status: string;
}

interface Prescription {
  medicine: string;
  potency?: string;
  quantity: string;
  doseForm?: string;
  dosePattern?: string;
  frequency?: string;
  duration?: string;
  durationDays?: number;
  bottles?: number;
  instructions?: string;
  isCombination?: boolean;
  combinationName?: string;
  combinationContent?: string;
}

interface PrescriptionRow {
  id: string;
  medicine: string;
  potency: string;
  quantity: string;
  doseForm: string;
  dose: string;
  frequency: string;
  pattern: string;
  duration: string;
  bottles: string;
}

interface SmartParsingRule {
  id: string;
  name: string;
  type: 'quantity' | 'doseForm' | 'dosePattern' | 'duration';
  pattern: string;
  replacement: string;
  isRegex: boolean;
  priority: number;
  isActive: boolean;
}

interface ParsedPrescription {
  medicineName: string;
  potency: string;
  quantity: string;
  doseForm: string;
  dosePerIntake: string;
  frequency: string;
  pattern: string;
  duration: string;
  prescriptionText: string;
}

// Smart Parsing Function
function parsePrescriptionText(input: string): ParsedPrescription | null {
  if (!input.trim()) return null;

  const text = input.trim().toLowerCase();
  const originalText = input.trim();

  // Common frequency patterns and their conversions
  const frequencyMap: Record<string, { pattern: string; frequency: string }> = {
    od: { pattern: "1-0-0", frequency: "OD" },
    bd: { pattern: "1-0-1", frequency: "BD" },
    tds: { pattern: "1-1-1", frequency: "TDS" },
    tid: { pattern: "1-1-1", frequency: "TDS" },
    qid: { pattern: "1-1-1-1", frequency: "QID" },
    hs: { pattern: "0-0-1", frequency: "HS" },
    sos: { pattern: "SOS", frequency: "SOS" },
    weekly: { pattern: "Weekly", frequency: "Weekly" },
    monthly: { pattern: "Monthly", frequency: "Monthly" },
  };

  // Extract duration (e.g., "7 days", "2 weeks", "1 month", "4 weeks")
  const durationMatch = text.match(/(\d+)\s*(days?|weeks?|months?)/i);
  const duration = durationMatch ? `${durationMatch[1]} ${durationMatch[2]}` : "";

  // Extract quantity - support fractions like "1/2oz", "1/2dr"
  // The fraction may be attached to the unit like "1/2oz" or have space "1/2 oz"
  let quantity = "";
  // Match fraction with unit attached (e.g., "1/2oz") or with space (e.g., "1/2 oz")
  const fractionQuantityMatch = text.match(/(\d+)\/(\d+)\s*(dr|oz|ml)/i);
  if (fractionQuantityMatch) {
    quantity = `${fractionQuantityMatch[1]}/${fractionQuantityMatch[2]}${fractionQuantityMatch[3]}`;
  } else {
    // Match whole number quantities - but not if preceded by / (to avoid matching "2" in "1/2oz")
    const wholeQuantityMatch = text.match(/(?<!\/)(\d+)\s*(dr|oz|ml)\b/i);
    if (wholeQuantityMatch) {
      quantity = `${wholeQuantityMatch[1]}${wholeQuantityMatch[2]}`;
    }
  }

  // Extract dose form (pills, drops, tablets, etc.) - may or may not have a number
  // First try with number (e.g., "4 pills")
  let doseForm = "";
  let dosePerIntake = "";
  const doseFormWithNumberMatch = text.match(/(\d+)\s*(pills?|drops?|tablets?|capsules?|powder|ointment|cream)\b/i);
  if (doseFormWithNumberMatch) {
    doseForm = doseFormWithNumberMatch[2].toLowerCase();
    dosePerIntake = doseFormWithNumberMatch[1];
  } else {
    // Try without number (e.g., "liquid")
    const doseFormNoNumberMatch = text.match(/\b(pills?|drops?|tablets?|capsules?|liquid|powder|ointment|cream)\b/i);
    if (doseFormNoNumberMatch) {
      doseForm = doseFormNoNumberMatch[1].toLowerCase();
      dosePerIntake = "";
    }
  }

  // Extract pattern - check for custom patterns like "6-6-6", "1-1-1", "1-0-1" first
  let frequency = "";
  let pattern = "";
  
  // Check for custom numeric pattern (e.g., "6-6-6", "1-1-1", "1-0-0")
  const customPatternMatch = text.match(/\b(\d+)-(\d+)-(\d+)\b/);
  if (customPatternMatch) {
    pattern = `${customPatternMatch[1]}-${customPatternMatch[2]}-${customPatternMatch[3]}`;
    // Derive frequency from pattern - count non-zero doses for times per day
    const doses = [customPatternMatch[1], customPatternMatch[2], customPatternMatch[3]].map(Number);
    const nonZeroDoses = doses.filter(d => d > 0).length;
    if (nonZeroDoses === 1) {
      frequency = "OD";
    } else if (nonZeroDoses === 2) {
      frequency = "BD";
    } else if (nonZeroDoses === 3) {
      frequency = "TDS";
    } else if (nonZeroDoses === 4) {
      frequency = "QID";
    }
  } else {
    // Check for predefined frequency keywords
    for (const [key, value] of Object.entries(frequencyMap)) {
      if (text.includes(key)) {
        frequency = value.frequency;
        pattern = value.pattern;
        break;
      }
    }
  }

  // Extract potency - match numbers followed by potency suffix (c, ch, m, x)
  // Common potencies: 6C, 30C, 200C, 1M, 10M, 30X, 200CH, etc.
  // The pattern needs to match "1m", "1M", "200c", "200C", "30ch", etc.
  const potencyMatch = text.match(/\b(\d+)\s*(c|ch|m|x)\b/i);
  let potency = potencyMatch ? `${potencyMatch[1]}${potencyMatch[2].toUpperCase()}` : "";

  // Extract medicine name - collect words until we hit a potency, quantity, or other marker
  // We need to identify the medicine name BEFORE potency/quantity/pattern
  let medicineName = "";
  const words = originalText.split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lowerWord = word.toLowerCase();
    
    // Check if this word is a potency (number + c/ch/m/x suffix)
    // Match patterns like "1M", "200C", "30CH", "10M"
    if (/^\d+[cchmx]$/i.test(word)) {
      break; // Stop at potency
    }
    
    // Check if this word is a fraction (like "1/2oz" or "1/2")
    if (/^\d+\/\d+/.test(word)) {
      break; // Stop at fraction quantity
    }
    
    // Check if this word is a standalone number that could be potency
    // Only break if followed by a potency suffix in next word or if it's a typical potency number
    if (/^\d+$/.test(word)) {
      // Check if next word is a potency suffix
      const nextWord = words[i + 1]?.toLowerCase();
      if (nextWord && /^[cchmx]$/.test(nextWord)) {
        break; // This number is a potency
      }
      // Check if it's a typical potency value (6, 12, 30, 200, 1000, etc.)
      const numVal = parseInt(word);
      if ([1, 3, 6, 12, 30, 60, 100, 200, 1000, 10000].includes(numVal) && !potency) {
        break; // Likely a potency
      }
    }
    
    // Check for dose forms
    if (["dr", "oz", "ml", "pills", "drops", "tablets", "capsules", "liquid", "powder", "ointment", "cream"].includes(lowerWord)) {
      break;
    }
    
    // Check for frequency keywords
    if (Object.keys(frequencyMap).includes(lowerWord)) {
      break;
    }
    
    // Check for duration keywords
    if (["for", "days", "weeks", "months"].includes(lowerWord)) {
      break;
    }
    
    // Check for pattern
    if (/^\d+-\d+-\d+$/.test(word)) {
      break;
    }
    
    // This word is part of the medicine name
    medicineName = medicineName ? `${medicineName} ${word}` : word;
  }

  // Capitalize medicine name properly (e.g., "Ars alb" -> "Ars Alb")
  medicineName = medicineName
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  // Generate prescription text
  let prescriptionText = "";
  if (medicineName && potency) {
    prescriptionText = `${medicineName} ${potency}`;
  } else if (medicineName) {
    prescriptionText = medicineName;
  }

  if (dosePerIntake && doseForm && pattern) {
    const doses = pattern.split("-");
    if (doses.length === 3 && !pattern.includes("SOS") && !pattern.includes("Weekly") && !pattern.includes("Monthly")) {
      const morning = doses[0] !== "0" ? `${dosePerIntake} ${doseForm} morning` : "";
      const afternoon = doses[1] !== "0" ? `${dosePerIntake} ${doseForm} afternoon` : "";
      const evening = doses[2] !== "0" ? `${dosePerIntake} ${doseForm} night` : "";
      const parts = [morning, afternoon, evening].filter(Boolean);
      if (parts.length > 0) {
        prescriptionText += `\n${parts.join(" – ")}`;
      }
    } else if (pattern === "SOS") {
      prescriptionText += `\n${dosePerIntake} ${doseForm} SOS`;
    } else if (pattern === "Weekly") {
      prescriptionText += `\n${dosePerIntake} ${doseForm} Weekly`;
    } else if (pattern === "Monthly") {
      prescriptionText += `\n${dosePerIntake} ${doseForm} Monthly`;
    }
  }

  if (duration) {
    prescriptionText += `\nfor ${duration}`;
  }

  return {
    medicineName,
    potency,
    quantity,
    doseForm,
    dosePerIntake,
    frequency,
    pattern,
    duration,
    prescriptionText,
  };
}

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// Create empty prescription row
function createEmptyRow(): PrescriptionRow {
  return {
    id: generateId(),
    medicine: "",
    potency: "",
    quantity: "",
    doseForm: "",
    dose: "",
    frequency: "",
    pattern: "",
    duration: "",
    bottles: "",
  };
}

// Create row from parsed prescription
function createRowFromParsed(parsed: ParsedPrescription): PrescriptionRow {
  return {
    id: generateId(),
    medicine: parsed.medicineName,
    potency: parsed.potency,
    quantity: parsed.quantity,
    doseForm: parsed.doseForm,
    dose: parsed.dosePerIntake,
    frequency: parsed.frequency,
    pattern: parsed.pattern,
    duration: parsed.duration,
    bottles: "",
  };
}

// Main Component
function DoctorPanelContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdFromUrl = searchParams.get('patientId');

  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);

  // State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [pastVisits, setPastVisits] = useState<Visit[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [caseText, setCaseText] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomInput, setSymptomInput] = useState('');
  const [editingSymptomIndex, setEditingSymptomIndex] = useState<number | null>(null);
  const [symptomHistory, setSymptomHistory] = useState<string[]>([]);
  const [showSymptomSuggestions, setShowSymptomSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showSaveNotice, setShowSaveNotice] = useState(false);
  const [isSystemAssist, setIsSystemAssist] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showMateriaMedica, setShowMateriaMedica] = useState(false);
  const [materiaMedicaQuery, setMateriaMedicaQuery] = useState('');
  const [showPharmacyQueue, setShowPharmacyQueue] = useState(false);
  
  // Additional fields
  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [testsRequired, setTestsRequired] = useState('');
  const [nextVisit, setNextVisit] = useState('');
  const [nextVisitDays, setNextVisitDays] = useState('');
  const [prognosis, setPrognosis] = useState('');
  const [remarksToFrontdesk, setRemarksToFrontdesk] = useState('');
  const [bp, setBp] = useState('');
  const [pulse, setPulse] = useState('');
  const [tempF, setTempF] = useState('');
  const [weightKg, setWeightKg] = useState('');
  
  // Additional notes form state
  const [showAdditionalNotes, setShowAdditionalNotes] = useState(false);
  
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; data: string; remarks?: string }>>([]);
  const [showUploadedFiles, setShowUploadedFiles] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ name: string; type: string; data: string; remarks?: string } | null>(null);
  const [viewerZoom, setViewerZoom] = useState(100);
  const [editingFileIndex, setEditingFileIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingRemarks, setEditingRemarks] = useState('');
  const [editingGridFileIndex, setEditingGridFileIndex] = useState<number | null>(null);
  
  // Field order for additional notes (persisted to localStorage)
  const [additionalNotesFieldOrder, setAdditionalNotesFieldOrder] = useState<string[]>(() => {
    const baseFields = ['diagnosis', 'testsRequired', 'advice', 'prognosis', 'remarksToFrontdesk', 'bp', 'pulse', 'tempF', 'weightKg'];
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('doctor_panel_field_order');
        if (saved) {
          const parsed = JSON.parse(saved);
          const merged = Array.isArray(parsed) ? [...parsed, ...baseFields.filter((f) => !parsed.includes(f))] : baseFields;
          localStorage.setItem('doctor_panel_field_order', JSON.stringify(merged));
          return merged;
        }
        return baseFields;
      } catch {
        return baseFields;
      }
    }
    return baseFields;
  });
  
  // Fee editing
  const [feeAmount, setFeeAmount] = useState('');
  const [feeType, setFeeType] = useState('consultation');
  const [feeTypeId, setFeeTypeId] = useState(''); // Store fee type ID
  const [feeTypes, setFeeTypes] = useState<any[]>([]); // Load from fee settings
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [showPatientMenu, setShowPatientMenu] = useState(false); // Patient dropdown menu
  const [showEditPatientForm, setShowEditPatientForm] = useState(false); // Edit patient form
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [currentQueueItem, setCurrentQueueItem] = useState<any>(null);
  
  // Last fee paid info
  const [lastFeeInfo, setLastFeeInfo] = useState<{
    date: string;
    amount: number;
    daysAgo: number;
    feeType: string;
    status?: 'paid' | 'pending';
  } | null>(null);
  
  // Current appointment fee (from appointment booking)
  const [currentAppointmentFee, setCurrentAppointmentFee] = useState<{
    feeAmount: number;
    feeType: string;
    feeTypeId: string;
    feeStatus: string;
    feeId?: string;
    appointmentId?: string;
  } | null>(null);
  
  // Combination medicines - now uses inline editing instead of modal
  const [editingCombinationIndex, setEditingCombinationIndex] = useState<number | null>(null);
  const [combinationName, setCombinationName] = useState('');
  const [combinationContent, setCombinationContent] = useState('');
  
  // Medicine autocomplete
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');
  const [medicineSuggestions, setMedicineSuggestions] = useState<{name: string; content?: string}[]>([]);
  const [showMedicineSuggestions, setShowMedicineSuggestions] = useState(false);
  const [selectedMedicineSuggestionIndex, setSelectedMedicineSuggestionIndex] = useState(-1);
  const [focusedMedicineIndex, setFocusedMedicineIndex] = useState<number | null>(null);
  
  // Database combinations for autocomplete
  const [dbCombinations, setDbCombinations] = useState<{name: string; content: string}[]>([]);
  
  // Smart parsing rules
  const [smartParsingRules, setSmartParsingRules] = useState<SmartParsingRule[]>([]);
  
  // Smart parsing input field
  const [smartParseInput, setSmartParseInput] = useState('');
  const smartParseInputRef = useRef<HTMLInputElement>(null);
  
  // AI Parsing settings
  const [aiParsingEnabled, setAiParsingEnabled] = useState(false);
  const [aiApiKey, setAiApiKey] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  
  // Prescription settings (from settings page)
  const [prescriptionSettings, setPrescriptionSettings] = useState<{
    potency: string[];
    quantity: string[];
    doseForm: string[];
    pattern: string[];
    frequency: string[];
    duration: string[];
  }>({
    potency: ['3x', '6c', '6x', '30c', '30x', '200c', '200x', '1M', '10M', '50M', 'CM', 'Q', '1x'],
    quantity: ['1/2dr', '1dr', '2dr', '1/2oz', '1oz', '2oz', '50ml', '100ml'],
    doseForm: ['Pills', 'Tabs', 'Drops', 'Liq', 'Powder', 'Sachet', 'Ointment', 'Cream', 'Serum', 'Oil'],
    pattern: ['1-1-1', '4-4-4', '6-6-6', '15-15-15', '20-20-20', '2-2-2'],
    frequency: ['Daily', 'Weekly', 'Twice Weekly', 'Thrice Weekly'],
    duration: ['Day', 'Week', 'Month'],
  });
  
  // Common homeopathic medicines for autocomplete
  const commonMedicines = [
    'Aconitum napellus', 'Arsenicum album', 'Belladonna', 'Bryonia alba', 'Calcarea carbonica',
    'Chamomilla', 'China officinalis', 'Coffea cruda', 'Dulcamara', 'Ferrum phosphoricum',
    'Gelsemium', 'Hepar sulphuris', 'Ignatia amara', 'Ipecacuanha', 'Kali bichromicum',
    'Lachesis', 'Lycopodium', 'Mercurius solubilis', 'Natrum muriaticum', 'Nux vomica',
    'Phosphorus', 'Pulsatilla', 'Rhus toxicodendron', 'Sepia', 'Silicea',
    'Sulphur', 'Thuja occidentalis', 'Arnica montana', 'Hypericum', 'Ruta graveolens',
    'Aesculus hippocastanum', 'Aloe socotrina', 'Antimonium crudum', 'Apis mellifica', 'Argentum nitricum',
    'Aurum metallicum', 'Baryta carbonica', 'Berberis vulgaris', 'Borax', 'Cactus grandiflorus',
    'Calcarea phosphorica', 'Cantharis', 'Carbo vegetabilis', 'Causticum', 'Cimicifuga',
    'Coccus cacti', 'Colocynthis', 'Conium maculatum', 'Cornus circinata', 'Crotalus horribilis',
    'Cuprum metallicum', 'Digitalis', 'Drosera', 'Echinacea', 'Eupatorium perforliatum',
    'Euphrasia', 'Graphites', 'Hamamelis', 'Hydrastis', 'Hypericum perfoliatum',
    'Kali carbonicum', 'Kali phosphoricum', 'Kreosotum', 'Lac caninum', 'Lobelia',
    'Magnesia phosphorica', 'Medorrhinum', 'Murex purpureus', 'Nitricum acidum', 'Oleander',
    'Oxalic acid', 'Petroleum', 'Phosphoricum acidum', 'Phytolacca', 'Platina',
    'Podophyllum', 'Psorinum', 'Pyrogenium', 'Ranunculus bulbosus', 'Raphanus',
    'Rumex crispus', 'Sabadilla', 'Sambucus nigra', 'Sanicula', 'Sarsaparilla',
    'Secale cornutum', 'Selenium', 'Spongia', 'Stannum metallicum', 'Staphysagria',
    'Stramonium', 'Sulphuricum acidum', 'Tabacum', 'Tarantula', 'Tellurium',
    'Theridion', 'Thlaspi', 'Tuberculinum', 'Veratrum album', 'Verbascum',
    'Viola odorata', 'Vipera', 'Zincum metallicum', 'Zingiber'
  ];
  
  // System memory for medicine patterns
  const MEDICINE_MEMORY_KEY = 'homeo_prescription_memory';
  const CUSTOM_MEDICINES_KEY = 'homeo_custom_medicines';
  const COMBINATION_NAMES_KEY = 'homeo_combination_names';

  // Cache for localStorage medicine data - avoids JSON.parse on every keystroke
  const customMedicinesCache = useRef<string[] | null>(null);
  const localStorageCombosCache = useRef<{ name: string; content: string }[] | null>(null);
  
  interface MedicineMemory {
    medicine: string;
    potency?: string;
    quantity: string;
    doseForm: string;
    dosePattern: string;
    frequency: string;
    duration: string;
    usageCount: number;
    lastUsed: Date;
  }
  
  // Get saved custom medicines (entered by user) - uses cache to avoid repeated JSON.parse
  const getCustomMedicines = (): string[] => {
    if (typeof window === 'undefined') return [];
    if (customMedicinesCache.current !== null) return customMedicinesCache.current;
    try {
      const data = localStorage.getItem(CUSTOM_MEDICINES_KEY);
      customMedicinesCache.current = data ? JSON.parse(data) : [];
      return customMedicinesCache.current!;
    } catch {
      return [];
    }
  };
  
  // Save a custom medicine entered by user
  const saveCustomMedicine = (medicine: string) => {
    if (typeof window === 'undefined' || !medicine.trim()) return;
    const customMeds = getCustomMedicines();
    const lowerMed = medicine.toLowerCase().trim();
    if (!customMeds.some(m => m.toLowerCase() === lowerMed)) {
      customMeds.push(medicine.trim());
      localStorage.setItem(CUSTOM_MEDICINES_KEY, JSON.stringify(customMeds));
      customMedicinesCache.current = null; // invalidate cache
    }
  };
  
  // Get saved combination names for autocomplete
  const getCombinationNames = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(COMBINATION_NAMES_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Support both old format (string[]) and new format ({name, content}[])
        if (parsed.length > 0 && typeof parsed[0] === 'object') {
          return parsed.map((c: { name: string }) => c.name);
        }
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  };
  
  // Get saved combinations with content - uses cache to avoid repeated JSON.parse
  const getCombinationsWithContent = (): { name: string; content: string }[] => {
    if (typeof window === 'undefined') return [];
    if (localStorageCombosCache.current !== null) return localStorageCombosCache.current;
    try {
      const data = localStorage.getItem(COMBINATION_NAMES_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Support both old format (string[]) and new format ({name, content}[])
        if (parsed.length > 0 && typeof parsed[0] === 'object') {
          localStorageCombosCache.current = parsed;
          return parsed;
        }
        // Old format - convert to new format with empty content
        const converted = parsed.map((name: string) => ({ name, content: '' }));
        localStorageCombosCache.current = converted;
        return converted;
      }
      localStorageCombosCache.current = [];
      return [];
    } catch {
      return [];
    }
  };
  
  // Save a combination name and content for autocomplete
  const saveCombinationName = (name: string, content: string = '') => {
    if (typeof window === 'undefined' || !name.trim()) return;
    const combos = getCombinationsWithContent();
    const lowerName = name.toLowerCase().trim();
    const existingIndex = combos.findIndex(c => c.name.toLowerCase() === lowerName);
    
    if (existingIndex >= 0) {
      // Update existing combination with new content
      combos[existingIndex] = { name: name.trim(), content };
    } else {
      // Add new combination
      combos.push({ name: name.trim(), content });
    }
    localStorage.setItem(COMBINATION_NAMES_KEY, JSON.stringify(combos));
    localStorageCombosCache.current = null; // invalidate cache
  };
  
  // Get all medicines for autocomplete (common + custom + combinations from both localStorage and database)
  const getAllMedicinesForAutocomplete = (query: string): {name: string; content?: string}[] => {
    const customMeds = getCustomMedicines();
    const localStorageCombos = getCombinationsWithContent();
    
    // Build combination list with content from database first, then localStorage as fallback
    const dbComboMap = new Map(dbCombinations.map(c => [c.name.toLowerCase(), c.content]));
    const localStorageComboMap = new Map(localStorageCombos.map(c => [c.name.toLowerCase(), c.content]));
    
    // Merge all combination names (database takes priority)
    const allComboNames = [...new Set([
      ...dbCombinations.map(c => c.name),
      ...localStorageCombos.map(c => c.name)
    ])]; 
    
    const filteredCustom = customMeds.filter(m => 
      m.toLowerCase().includes(query.toLowerCase())
    ).map(m => ({ name: m }));
    
    const filteredCombos = allComboNames.filter(c => 
      c.toLowerCase().includes(query.toLowerCase())
    ).map(c => {
      // Get content from database first, then localStorage
      const content = dbComboMap.get(c.toLowerCase()) || localStorageComboMap.get(c.toLowerCase()) || '';
      return { name: c, content };
    });
    
    const filteredCommon = commonMedicines.filter(m => 
      m.toLowerCase().includes(query.toLowerCase())
    ).map(m => ({ name: m }));
    
    // Combine, prioritize custom medicines and combinations
    return [...filteredCustom, ...filteredCombos, ...filteredCommon].slice(0, 10);
  };
  
  const getMedicineMemory = (): Record<string, MedicineMemory> => {
    if (typeof window === 'undefined') return {};
    try {
      const data = localStorage.getItem(MEDICINE_MEMORY_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  };
  
  const saveMedicineToMemory = (medicine: string, potency: string, pattern: Prescription) => {
    if (typeof window === 'undefined' || !medicine.trim()) return;
    
    // Save medicine to custom list
    saveCustomMedicine(medicine);
    
    const memory = getMedicineMemory();
    const key = `${medicine.toLowerCase()}_${potency || ''}`;
    
    memory[key] = {
      medicine: medicine,
      potency: potency || '',
      quantity: pattern.quantity || '1dr',
      doseForm: pattern.doseForm || 'pills',
      dosePattern: pattern.dosePattern || '1-1-1',
      frequency: pattern.frequency || 'Daily',
      duration: pattern.duration || '7 days',
      usageCount: (memory[key]?.usageCount || 0) + 1,
      lastUsed: new Date()
    };
    
    localStorage.setItem(MEDICINE_MEMORY_KEY, JSON.stringify(memory));
  };
  
  const getMedicinePattern = (medicine: string, potency: string): Prescription | null => {
    const memory = getMedicineMemory();
    const key = `${medicine.toLowerCase()}_${potency || ''}`;
    return memory[key] || null;
  };
  
  // Load saved pattern when medicine/potency changes
  const loadSavedPattern = (index: number, medicine: string, potency: string) => {
    if (!medicine.trim()) return;
    
    const pattern = getMedicinePattern(medicine, potency);
    if (pattern) {
      setPrescriptions(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          quantity: pattern.quantity,
          doseForm: pattern.doseForm,
          dosePattern: pattern.dosePattern,
          frequency: pattern.frequency,
          duration: pattern.duration,
        };
        return updated;
      });
    }
  };
  
  // Modal states
  const [showEndConsultationModal, setShowEndConsultationModal] = useState(false);
  const [showSameDayReopenModal, setShowSameDayReopenModal] = useState(false);
  const [showPrescriptionPreview, setShowPrescriptionPreview] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);
  const [showRepeatVisitChoice, setShowRepeatVisitChoice] = useState(false);
  const [repeatVisitId, setRepeatVisitId] = useState<string | null>(null);
  const [isConsultationEnded, setIsConsultationEnded] = useState(false);
  const [pharmacySent, setPharmacySent] = useState(false);
  const [showPharmacyMini, setShowPharmacyMini] = useState(false);
  const [showAppointmentsBoard, setShowAppointmentsBoard] = useState(false);
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [nextPatientId, setNextPatientId] = useState<string | null>(null);
  const [pharmacyDockSide, setPharmacyDockSide] = useState<'right' | 'left'>('right');
  const [pharmacyLiveItems, setPharmacyLiveItems] = useState<PharmacyQueueItem[]>([]);
  
  // Prescription preview/print settings
  const [prescriptionSettingsView, setPrescriptionSettingsView] = useState<any | null>(null);
  const [prescriptionSettingsPrint, setPrescriptionSettingsPrint] = useState<any | null>(null);
  const [doctorSignatureUrl, setDoctorSignatureUrl] = useState<string | null>(null);
  const [smartParseHistory, setSmartParseHistory] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('smartParseHistory');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [smartParseSuggestions, setSmartParseSuggestions] = useState<string[]>([]);
  const [showSmartParseSuggestions, setShowSmartParseSuggestions] = useState(false);
  const [smartParseSelectedIndex, setSmartParseSelectedIndex] = useState<number>(-1);
  
  useEffect(() => {
    try {
      const raw = doctorSettingsDb.get('prescriptionSettings');
      if (raw) {
        const parsed = JSON.parse(raw as string);
        setPrescriptionSettingsView(parsed.view || null);
        setPrescriptionSettingsPrint(parsed.print || null);
        setDoctorSignatureUrl(parsed.signatureUrl || null);
      } else {
        setPrescriptionSettingsView({
          patient: { name: true, age: true, sex: true, visitDate: true, regNo: true },
          rxFields: { medicine: true, potency: true, quantity: true, doseForm: true, dosePattern: true, frequency: true, duration: true, instructions: true, showCombinationDetails: true },
          additional: { caseText: true, advice: true, nextVisit: true }
        });
        setPrescriptionSettingsPrint({
          patient: { name: true, age: true, sex: true, visitDate: true, regNo: true },
          rxFields: { medicine: true, potency: true, quantity: true, doseForm: true, dosePattern: true, frequency: true, duration: true, instructions: true, showCombinationDetails: true },
          additional: { caseText: true, advice: true, nextVisit: true }
        });
      }
    } catch {
      // Fallback defaults
      setPrescriptionSettingsView({
        patient: { name: true, age: true, sex: true, visitDate: true, regNo: true },
        rxFields: { medicine: true, potency: true, quantity: true, doseForm: true, dosePattern: true, frequency: true, duration: true, instructions: true, showCombinationDetails: true },
        additional: { caseText: true, advice: true, nextVisit: true }
      });
      setPrescriptionSettingsPrint({
        patient: { name: true, age: true, sex: true, visitDate: true, regNo: true },
        rxFields: { medicine: true, potency: true, quantity: true, doseForm: true, dosePattern: true, frequency: true, duration: true, instructions: true, showCombinationDetails: true },
        additional: { caseText: true, advice: true, nextVisit: true }
      });
    }
  }, []);
  
  useEffect(() => {
    const refreshPharmacy = () => {
      const all = (pharmacyQueueDb.getAll() || []) as PharmacyQueueItem[];
      const todayISO = new Date().toISOString().split('T')[0];
      const filtered = all.filter((q) => {
        const createdISO = (q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt)).toISOString().split('T')[0];
        const isToday = createdISO === todayISO;
        return isToday;
      }).sort((a, b) => {
        // Priority first, then by creation time
        if (a.priority && !b.priority) return -1;
        if (!a.priority && b.priority) return 1;
        const timeA = (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)).getTime();
        const timeB = (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)).getTime();
        return timeA - timeB;
      });
      setPharmacyLiveItems(filtered);
    };
    refreshPharmacy();
    const interval = setInterval(refreshPharmacy, 10000);
    const handler = () => refreshPharmacy();
    if (typeof window !== 'undefined') {
      window.addEventListener('pharmacy-queue-updated', handler as EventListener);
      window.addEventListener('fees-updated', handler as EventListener);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pharmacy-queue-updated', handler as EventListener);
        window.removeEventListener('fees-updated', handler as EventListener);
      }
    };
  }, []);
  
  // Past visits popup state
  const [showPastVisitsPopup, setShowPastVisitsPopup] = useState(false);
  const [pastVisitPrescriptions, setPastVisitPrescriptions] = useState<Record<string, Prescription[]>>({});
  
  // Refs
  const caseTextRef = useRef<HTMLTextAreaElement>(null);
  const medicineInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(-1);
  const searchListRef = useRef<HTMLDivElement | null>(null);
  const searchItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Search Logic
  useEffect(() => {
    if (debouncedSearchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const allPatients = patientDb.getAll() as Patient[];
      const filtered = allPatients.filter((p) =>
        p.firstName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        p.lastName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        p.fullName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        p.registrationNumber.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        p.mobileNumber.includes(debouncedSearchQuery)
      ).map((p): PatientRecord => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        mobile: p.mobileNumber,
        registrationNumber: p.registrationNumber,
        age: p.dateOfBirth ? new Date().getFullYear() - new Date(p.dateOfBirth).getFullYear() : undefined,
        gender: p.gender,
      }));
      setSearchResults(filtered.slice(0, 10)); // Limit to 10 for performance
      setShowSearchResults(true);
    } catch (error) {
      console.error('Patient search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [debouncedSearchQuery]);

  // Search for patients
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Select a patient from search results
  const handleSelectPatient = (selectedPatient: PatientRecord) => {
    loadPatientData(selectedPatient.id);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    
    // Update URL with patient ID
    router.push(`/doctor-panel?patientId=${selectedPatient.id}`);
  };

  // Load patient data from database
  const loadPatientData = useCallback(async (id: string) => {
    const patientData = patientDb.getById(id) as Patient | undefined;
    
    if (!patientData) return;
    
    // Calculate age from dateOfBirth or use age field directly
    let calculatedAge: number | undefined;
    if (patientData.age) {
      calculatedAge = patientData.age;
    } else if (patientData.dateOfBirth) {
      calculatedAge = new Date().getFullYear() - new Date(patientData.dateOfBirth).getFullYear();
    }
    
    const patientRecord: PatientRecord = {
      id: patientData.id,
      firstName: patientData.firstName,
      lastName: patientData.lastName,
      mobile: patientData.mobileNumber,
      registrationNumber: patientData.registrationNumber,
      age: calculatedAge,
      gender: patientData.gender,
    };
    setPatient(patientRecord);
    
    // Store in localStorage that a patient is currently loaded
    if (typeof window !== 'undefined') {
      localStorage.setItem('doctorPanelCurrentPatient', patientData.id);
    }

    // Find and set the current queue item for this patient
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeSlots = slotDb.getActive() as Slot[];
    if (activeSlots.length > 0) {
      const slot = activeSlots[0];
      const config = queueDb.getOrCreate(today, slot.id, slot.name) as QueueConfig;
      const queueItems = queueItemDb.getByQueueConfig(config.id) as QueueItem[];
      const patientQueueItem = queueItems.find((item) => item.patientId === patientData.id);
      if (patientQueueItem) {
        setCurrentQueueItem(patientQueueItem);
      }
    }

    // Check for today's appointment with fees
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    
    const appointments = appointmentDb.getByPatient(patientData.id) as Appointment[];
    const todayAppointment = appointments.find((apt: Appointment) => {
      const aptDate = new Date(apt.appointmentDate);
      // Include scheduled appointments for fee display (new patients may have scheduled status)
      return aptDate >= todayStart && aptDate <= todayEnd && 
             (apt.status === 'checked-in' || apt.status === 'in-progress' || apt.status === 'scheduled');
    });
    
    if (todayAppointment) {
      // Use appointment fees
      const apt = todayAppointment as Appointment & { feeTypeId?: string; feeId?: string };
      console.log('[DoctorPanel] Found today appointment:', todayAppointment);
      console.log('[DoctorPanel] Setting appointmentId:', todayAppointment.id);
      setCurrentAppointmentFee({
        feeAmount: (todayAppointment.feeAmount as number) || 0,
        feeType: (todayAppointment.feeType as string) || 'consultation',
        feeTypeId: apt.feeTypeId || '',
        feeStatus: (todayAppointment.feeStatus as string) || 'pending',
        feeId: apt.feeId || '',
        appointmentId: todayAppointment.id,
      });
      setFeeAmount(todayAppointment.feeAmount !== undefined && todayAppointment.feeAmount !== null ? String(todayAppointment.feeAmount) : '');
      setFeeType((todayAppointment.feeType as string) || 'Consultation');
      setFeeTypeId(apt.feeTypeId || ''); // Set fee type ID from appointment
      setPaymentStatus((todayAppointment.feeStatus as string) || 'pending');
      // Mark status as in-progress when entering case taking
      if ((todayAppointment.status as string) !== 'in-progress') {
        appointmentDb.update(todayAppointment.id, { status: 'in-progress' });
      }
      // Load any active visit and hydrate symptoms
      const activeVisit = doctorVisitDb.getActiveByPatient(patientData.id);
      if (activeVisit) {
        const text = activeVisit.caseText || '';
        setCaseText(text);
        setSymptoms(text.split('\n').filter((s) => s.trim().length > 0));
        setSavedVisitId(activeVisit.id);
      }
    }

    // Get last fee paid info
    const lastFee = feeHistoryDb.getLastByPatient(patientData.id) as FeeHistoryEntry | null;
    if (lastFee) {
      const paidDate = new Date(lastFee.paidDate);
      const diffTime = Math.abs(todayStart.getTime() - paidDate.getTime());
      const daysAgo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const isSameDay = 
        paidDate.getDate() === todayStart.getDate() &&
        paidDate.getMonth() === todayStart.getMonth() &&
        paidDate.getFullYear() === todayStart.getFullYear();
      
      setLastFeeInfo({
        date: paidDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: lastFee.amount,
        daysAgo: isSameDay ? 0 : daysAgo,
        feeType: lastFee.feeType,
        status: 'paid',
      });
    } else if (todayAppointment && (todayAppointment.feeAmount as number) > 0) {
      // If no paid fee history but current appointment exists with fee > 0, show the appointment fee as last fee info
      // This handles new patients and shows their fee regardless of status (pending, paid, exempt)
      const aptDate = new Date(todayAppointment.appointmentDate);
      const feeStatus = (todayAppointment.feeStatus as string) || 'pending';
      setLastFeeInfo({
        date: aptDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: (todayAppointment.feeAmount as number),
        daysAgo: 0,
        feeType: (todayAppointment.feeType as string) || 'consultation',
        status: feeStatus as 'paid' | 'pending',
      });
    } else {
      setLastFeeInfo(null);
    }

    // Load actual past visits from database first to calculate visit number
    const savedVisits = doctorVisitDb.getByPatient(id) as DoctorVisit[];
    
    // Sort by date (oldest first) to assign correct visit numbers
    const sortedVisits = [...savedVisits]
      .filter(v => v.status === 'locked' || v.status === 'completed')
      .sort((a, b) => {
        const dateA = a.visitDate instanceof Date ? a.visitDate.getTime() : new Date(a.visitDate).getTime();
        const dateB = b.visitDate instanceof Date ? b.visitDate.getTime() : new Date(b.visitDate).getTime();
        return dateA - dateB; // Oldest first
      });
    
    // Assign visit numbers based on chronological order
    const formattedVisits: Visit[] = sortedVisits.map((v, index) => ({
      id: v.id,
      patientId: v.patientId,
      visitDate: v.visitDate,
      visitNumber: index + 1, // Assign visit number based on order
      chiefComplaint: v.chiefComplaint,
      caseText: v.caseText,
      diagnosis: v.diagnosis,
      advice: v.advice,
      testsRequired: v.testsRequired,
      nextVisit: v.nextVisit,
      prognosis: v.prognosis,
      remarksToFrontdesk: v.remarksToFrontdesk,
      status: v.status,
    }));
    
    // Sort for display (newest first)
    const displayVisits = [...formattedVisits].sort((a, b) => 
      new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
    );
    setPastVisits(displayVisits);
    
    const nextVisitNumber = formattedVisits.length + 1;
    const activeVisit = doctorVisitDb.getActiveByPatient(id) as DoctorVisit | undefined;
    const todayISO = new Date().toISOString().split('T')[0];
    const todaysLocked = (doctorVisitDb.getByPatient(id) as DoctorVisit[]).find((v) => {
      const d = (v.visitDate instanceof Date ? v.visitDate : new Date(v.visitDate)).toISOString().split('T')[0];
      return d === todayISO && (v.status === 'locked' || v.status === 'completed');
    });
    if (activeVisit && !todaysLocked) {
      setCurrentVisit({
        id: activeVisit.id,
        patientId: activeVisit.patientId,
        visitDate: activeVisit.visitDate,
        visitNumber: nextVisitNumber,
        chiefComplaint: activeVisit.chiefComplaint,
        caseText: activeVisit.caseText,
        diagnosis: activeVisit.diagnosis,
        advice: activeVisit.advice,
        testsRequired: activeVisit.testsRequired,
        nextVisit: activeVisit.nextVisit,
        prognosis: activeVisit.prognosis,
        remarksToFrontdesk: activeVisit.remarksToFrontdesk,
        status: 'active',
      });
      setSavedVisitId(activeVisit.id);
      const rx = doctorPrescriptionDb.getByVisit(activeVisit.id);
      // Replace prescriptions to avoid duplicates
      setPrescriptions(rx.map((p) => ({
        medicine: p.medicine,
        potency: p.potency || '',
        quantity: p.quantity,
        doseForm: p.doseForm || '',
        dosePattern: p.dosePattern || '',
        frequency: p.frequency || '',
        duration: p.duration || '',
        durationDays: p.durationDays || 0,
        bottles: p.bottles || 1,
        instructions: p.instructions || '',
        isCombination: p.isCombination || false,
        combinationName: p.combinationName || '',
        combinationContent: p.combinationContent || '',
      })));
      setCaseText(activeVisit.caseText || '');
      setDiagnosis(activeVisit.diagnosis || '');
      setAdvice(activeVisit.advice || '');
      setTestsRequired(activeVisit.testsRequired || '');
      setPrognosis(activeVisit.prognosis || '');
      setRemarksToFrontdesk(activeVisit.remarksToFrontdesk || '');
    } else {
      // Show choice modal when there is a same-day completed/locked visit or no active visit
      if (activeVisit || todaysLocked) {
        setShowRepeatVisitChoice(true);
        setRepeatVisitId((activeVisit?.id || todaysLocked?.id) || null);
        // Ensure no leftover prescriptions causing duplicates
        setSavedVisitId(null);
        setPrescriptions([]);
        setCaseText('');
        setDiagnosis('');
        setAdvice('');
        setTestsRequired('');
        setPrognosis('');
        setRemarksToFrontdesk('');
        setBp('');
        setPulse('');
        setTempF('');
        setWeightKg('');
      }
      const mockActiveVisit: Visit = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        patientId: id,
        visitDate: new Date(),
        visitNumber: nextVisitNumber,
        status: 'active',
      };
      setCurrentVisit(mockActiveVisit);
    }
  }, [setPatient, setCurrentVisit, setPastVisits, setFeeAmount, setFeeType, setPaymentStatus, setLastFeeInfo]);

  // Load fee types from settings on mount
  useEffect(() => {
    const activeFees = feeDb.getActive() as any[];
    setFeeTypes(activeFees);
  }, []);
  
  // Listen for fee types updates
  useEffect(() => {
    const handleFeeTypesUpdate = () => {
      const activeFees = feeDb.getActive() as any[];
      setFeeTypes(activeFees);
      console.log('[DoctorPanel] Fee types refreshed:', activeFees.length);
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('fee-types-updated', handleFeeTypesUpdate);
      return () => window.removeEventListener('fee-types-updated', handleFeeTypesUpdate);
    }
  }, []);
  
  // Close patient menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-menu-container')) {
        setShowPatientMenu(false);
      }
    };
    
    if (showPatientMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPatientMenu]);

  // Load patient from URL on mount
  useEffect(() => {
    if (patientIdFromUrl) {
      loadPatientData(patientIdFromUrl);
    }
  }, [patientIdFromUrl, loadPatientData]);

  // Patient name cache to avoid repeated DB lookups on every poll tick
  const patientNameCache = useRef<Record<string, { name: string; reg: string }>>({});

  // Load today's appointments - only poll when the board is open
  useEffect(() => {
    const loadTodayAppointments = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const allAppointments = appointmentDb.getAll() as any[];
      const todayApts = allAppointments
        .filter((apt: any) => {
          const aptDate = new Date(apt.appointmentDate);
          return aptDate >= today && aptDate <= todayEnd && ['scheduled', 'confirmed', 'checked-in', 'completed', 'billed'].includes(apt.status);
        })
        .sort((a: any, b: any) => {
          const timeA = a.appointmentTime || '00:00';
          const timeB = b.appointmentTime || '00:00';
          return timeA.localeCompare(timeB);
        })
        .map((apt: any) => {
          // Use cached patient name to avoid DB lookup on every tick
          if (!patientNameCache.current[apt.patientId]) {
            const p = patientDb.getById(apt.patientId) as any;
            patientNameCache.current[apt.patientId] = {
              name: p ? `${p.firstName} ${p.lastName}` : 'Unknown',
              reg: p?.registrationNumber || '',
            };
          }
          const cached = patientNameCache.current[apt.patientId];
          return {
            ...apt,
            patientName: cached.name,
            registrationNumber: cached.reg,
          };
        });
      
      setTodayAppointments(todayApts);
    };
    
    loadTodayAppointments();
    // Only poll when the appointments board is visible
    if (!showAppointmentsBoard) return;
    const interval = setInterval(loadTodayAppointments, 10000);
    return () => clearInterval(interval);
  }, [showAppointmentsBoard]);
  
  // Call patient function
  const handleCallPatient = async (appointmentId: string, patientId: string) => {
    try {
      // Get the appointment to get the token number
      const appointment = appointmentDb.getById(appointmentId) as Appointment | undefined;
      if (!appointment) return;
      
      // Check in the appointment
      appointmentDb.checkIn(appointmentId);
      
      // Get queue config and call patient in queue
      const today = new Date();
      const activeSlots = slotDb.getActive() as Slot[];
      if (activeSlots.length > 0) {
        const config = queueDb.getOrCreate(today, activeSlots[0].id, activeSlots[0].name) as QueueConfig;
        
        // ALWAYS create a NEW queue item for this call (don't reuse old ones)
        const patientData = patientDb.getById(patientId) as any;
        const newItem = queueItemDb.create({
          queueConfigId: config.id,
          patientId: patientId,
          patientName: `${patientData.firstName} ${patientData.lastName}`,
          tokenNumber: appointment.tokenNumber,
          status: 'waiting',
          priority: 'normal',
          checkInTime: new Date(),
          slotName: activeSlots[0].name
        }) as any;
        
        const queueItem = newItem as QueueItem;
        
        // Call the patient in queue
        if (queueItem) {
          queueItemDb.call(queueItem.id);
          // Store the called queue item ID in localStorage so patient view knows who to display
          if (typeof window !== 'undefined') {
            localStorage.setItem('doctorPanelCurrentPatient', patientId);
            localStorage.setItem('doctorPanelCalledQueueItemId', queueItem.id);
            // Flush DB to localStorage immediately so patient view tab sees it right away
            db.flushToLocalStorage();
            // Dispatch custom event to notify patient view immediately
            window.dispatchEvent(new CustomEvent('tokenCalled', { 
              detail: { queueItemId: queueItem.id, tokenNumber: queueItem.tokenNumber } 
            }));
          }
        }
      }
      
      // Load the patient in doctor panel
      await loadPatientData(patientId);
      
      // Close the appointments board
      setShowAppointmentsBoard(false);
      
      // Dispatch event to update dashboard
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patient-called', { 
          detail: { patientId, appointmentId } 
        }));
      }
    } catch (error) {
      console.error('Error calling patient:', error);
    }
  };
  
  // Flag next patient
  const handleFlagNextPatient = (patientId: string) => {
    setNextPatientId(patientId);
    
    // Dispatch event to update dashboard
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('next-patient-flagged', { 
        detail: { patientId } 
      }));
    }
  };

  // Load smart parsing rules
  useEffect(() => {
    const loadSmartParsingRules = async () => {
      try {
        const response = await fetch('/api/smart-parsing');
        const data = await response.json();
        if (data.success && data.data) {
          // Filter only active rules and sort by priority
          const activeRules = data.data
            .filter((rule: SmartParsingRule) => rule.isActive)
            .sort((a: SmartParsingRule, b: SmartParsingRule) => b.priority - a.priority);
          setSmartParsingRules(activeRules);
        }
      } catch (error) {
        console.error('Failed to load smart parsing rules:', error);
      }
    };
    loadSmartParsingRules();
    
    // Load AI parsing settings
    try {
      const savedSettings = localStorage.getItem('aiParsingSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        setAiParsingEnabled(settings.enabled || false);
        setAiApiKey(settings.apiKey || '');
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
    
    // Load prescription settings
    try {
      const savedPrescriptionSettings = localStorage.getItem('prescription_settings');
      if (savedPrescriptionSettings) {
        const settings = JSON.parse(savedPrescriptionSettings);
        setPrescriptionSettings(settings);
      }
    } catch (error) {
      console.error('Failed to load prescription settings:', error);
    }
    
    // Load combinations from database
    const loadCombinations = async () => {
      try {
        const response = await fetch('/api/doctor-panel/combinations');
        const data = await response.json();
        if (Array.isArray(data)) {
          setDbCombinations(data.map((c: { name: string; content: string }) => ({ name: c.name, content: c.content })));
        }
      } catch (error) {
        console.error('Failed to load combinations:', error);
      }
    };
    loadCombinations();
  }, []);

  // ===== CASE TAKING =====
  
  const handleCaseTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setCaseText(text);
    
    // Check for vague symptoms if system assist is on
    if (isSystemAssist) {
      analyzeCaseText(text);
    }
  };

  useEffect(() => {
    const joined = symptoms.join('\n');
    setCaseText(joined);
    if (isSystemAssist) {
      analyzeCaseText(joined);
    }
  }, [symptoms]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load symptom history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('symptomHistory');
    if (saved) {
      try {
        setSymptomHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load symptom history:', e);
      }
    }
  }, []);

  const handleAddSymptom = () => {
    const text = symptomInput.trim();
    if (!text) return;
    setSymptoms((prev) => [...prev, text]);
    
    // Update history immediately (synchronously update state)
    const updated = [text, ...symptomHistory.filter(s => s !== text)].slice(0, 50);
    setSymptomHistory(updated);
    localStorage.setItem('symptomHistory', JSON.stringify(updated));
    
    setSymptomInput('');
    setShowSymptomSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const getFilteredSuggestions = () => {
    const input = symptomInput.trim().toLowerCase();
    if (!input) return [];
    
    // Use state directly - it's kept in sync with localStorage already
    return symptomHistory.filter(s => 
      s.toLowerCase().includes(input) && !symptoms.includes(s)
    ).slice(0, 8); // Show max 8 suggestions
  };

  const handleSymptomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const suggestions = getFilteredSuggestions();
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
      setShowSymptomSuggestions(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        // Fill input with selected suggestion and immediately add it
        const selectedSymptom = suggestions[selectedSuggestionIndex];
        setSymptoms((prev) => [...prev, selectedSymptom]);
        
        // Update history
        const updated = [selectedSymptom, ...symptomHistory.filter(s => s !== selectedSymptom)].slice(0, 50);
        setSymptomHistory(updated);
        localStorage.setItem('symptomHistory', JSON.stringify(updated));
        
        // Clear input and close suggestions
        setSymptomInput('');
        setShowSymptomSuggestions(false);
        setSelectedSuggestionIndex(-1);
      } else {
        handleAddSymptom();
      }
    } else if (e.key === 'Escape') {
      setShowSymptomSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const startEditSymptom = (index: number) => {
    setEditingSymptomIndex(index);
  };

  const commitEditSymptom = (index: number, value: string) => {
    const val = value.trim();
    setSymptoms((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    setEditingSymptomIndex(null);
  };

  const removeSymptom = (index: number) => {
    setSymptoms((prev) => prev.filter((_, i) => i !== index));
  };
  const addCaseLine = (line: string) => {
    setCaseText(prev => prev + (prev ? '\n' : '') + line);
    setTimeout(() => {
      if (caseTextRef.current) {
        caseTextRef.current.focus();
      }
    }, 0);
  };

  const analyzeCaseText = (text: string) => {
    // Simple vague symptom detection
    const vagueTerms = ['pain', '不舒服', 'problem', 'issue'];
    // This would integrate with AI/system assist in real implementation
  };

  // ===== PRESCRIPTION TABLE =====

  const addEmptyPrescriptionRow = () => {
    setPrescriptions(prev => [...prev, {
      medicine: '',
      potency: '',
      quantity: '1dr',
      doseForm: 'pills',
      dosePattern: '1-1-1',
      frequency: 'Daily',
      duration: '7 days',
      bottles: 1,
    }]);
  };

  const updatePrescriptionRow = (index: number, field: string, value: string | number) => {
    setPrescriptions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removePrescriptionRow = (index: number) => {
    setPrescriptions(prev => prev.filter((_, i) => i !== index));
  };

  const movePrescriptionRow = (index: number, direction: 'up' | 'down') => {
    setPrescriptions(prev => {
      const updated = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex >= 0 && newIndex < updated.length) {
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      }
      return updated;
    });
  };

  const parseSmartEntry = (text: string, existingRules: SmartParsingRule[] = []): Prescription => {
    // Smart parsing for one-line entry using database rules
    // Example: "Arnica 200 2dr 4 pills TDS/3 times a day for 7 days"
    
    const parts = text.split(' ');
    
    let rx: Prescription = {
      medicine: '',
      potency: '',
      quantity: '1dr',
      doseForm: 'pills',
      dosePattern: '1-1-1',
      frequency: 'Daily',
      duration: '7 days',
      bottles: 1,
    };

    // Parse medicine and potency (assume first 1-2 parts)
    if (parts.length > 0) {
      rx.medicine = parts[0];
      // Check if second part is potency (number or 200/1M etc)
      if (parts.length > 1 && /^\d+$/.test(parts[1])) {
        rx.potency = parts[1];
      }
    }

    // If we have database rules, use them
    if (existingRules.length > 0) {
      // Apply rules by type in order: quantity, doseForm, dosePattern, duration
      const quantityRules = existingRules.filter(r => r.type === 'quantity');
      const doseFormRules = existingRules.filter(r => r.type === 'doseForm');
      const dosePatternRules = existingRules.filter(r => r.type === 'dosePattern');
      const durationRules = existingRules.filter(r => r.type === 'duration');
      
      // Apply quantity rules
      for (const rule of quantityRules) {
        try {
          const regex = rule.isRegex ? new RegExp(rule.pattern, 'i') : null;
          if (regex && regex.test(text)) {
            const match = text.match(regex);
            if (match) {
              rx.quantity = rule.replacement.replace(/\$(\d+)/g, (_, num) => match[parseInt(num)] || '');
            }
            break;
          } else if (!rule.isRegex && text.toLowerCase().includes(rule.pattern.toLowerCase())) {
            rx.quantity = rule.replacement;
            break;
          }
        } catch (e) {
          // Skip invalid regex
        }
      }
      
      // Apply dose form rules
      for (const rule of doseFormRules) {
        try {
          const regex = rule.isRegex ? new RegExp(rule.pattern, 'i') : null;
          if (regex && regex.test(text)) {
            const match = text.match(regex);
            if (match) {
              rx.doseForm = rule.replacement.replace(/\$(\d+)/g, (_, num) => match[parseInt(num)] || '');
            }
            break;
          } else if (!rule.isRegex && text.toLowerCase().includes(rule.pattern.toLowerCase())) {
            rx.doseForm = rule.replacement;
            break;
          }
        } catch (e) {
          // Skip invalid regex
        }
      }
      
      // Apply dose pattern rules - handle special case for TDS with quantities
      // Example: "4 pills TDS" should result in "4-4-4"
      const tdsMatch = text.match(/(\d+)\s*pills?\s*TDS/i);
      if (tdsMatch) {
        const quantity = tdsMatch[1];
        rx.dosePattern = `${quantity}-${quantity}-${quantity}`;
      } else {
        for (const rule of dosePatternRules) {
          try {
            const regex = rule.isRegex ? new RegExp(rule.pattern, 'i') : null;
            if (regex && regex.test(text)) {
              const match = text.match(regex);
              if (match) {
                rx.dosePattern = rule.replacement.replace(/\$(\d+)/g, (_, num) => match[parseInt(num)] || '');
              }
              break;
            } else if (!rule.isRegex && text.toLowerCase().includes(rule.pattern.toLowerCase())) {
              rx.dosePattern = rule.replacement;
              break;
            }
          } catch (e) {
            // Skip invalid regex
          }
        }
      }
      
      // Apply duration rules
      for (const rule of durationRules) {
        try {
          const regex = rule.isRegex ? new RegExp(rule.pattern, 'i') : null;
          if (regex && regex.test(text)) {
            const match = text.match(regex);
            if (match) {
              const replacement = rule.replacement.replace(/\$(\d+)/g, (_, num) => match[parseInt(num)] || '');
              rx.duration = replacement;
              // Calculate duration in days
              if (replacement.toLowerCase().includes('week')) {
                rx.durationDays = parseInt(replacement) * 7;
              } else if (replacement.toLowerCase().includes('month')) {
                rx.durationDays = parseInt(replacement) * 30;
              } else {
                rx.durationDays = parseInt(replacement);
              }
            }
            break;
          } else if (!rule.isRegex && text.toLowerCase().includes(rule.pattern.toLowerCase())) {
            rx.duration = rule.replacement;
            break;
          }
        } catch (e) {
          // Skip invalid regex
        }
      }
    } else {
      // Fallback to basic parsing if no rules loaded
      // Parse quantity
      const quantityMatch = text.match(/(\d+)\s*(dr|oz|bottle|pills?)/i);
      if (quantityMatch) {
        rx.quantity = quantityMatch[0];
        rx.doseForm = quantityMatch[2].toLowerCase().includes('dr') ? 'drops' : 'pills';
      }

      // Parse dose pattern (4-4-4, 1-0-1, etc)
      const patternMatch = text.match(/(\d-\d-\d)/);
      if (patternMatch) {
        rx.dosePattern = patternMatch[1];
      }

      // Parse frequency with TDS special handling
      const tdsMatch = text.match(/(\d+)\s*pills?\s*TDS/i);
      if (tdsMatch) {
        rx.frequency = 'Daily';
        rx.dosePattern = `${tdsMatch[1]}-${tdsMatch[1]}-${tdsMatch[1]}`;
      } else if (/tds|3\s*times/i.test(text)) {
        rx.frequency = 'Daily';
        rx.dosePattern = '1-1-1';
      } else if (/bid|2\s*times/i.test(text)) {
        rx.frequency = 'Daily';
        rx.dosePattern = '1-0-1';
      } else if (/hs|night/i.test(text)) {
        rx.frequency = 'Daily';
        rx.dosePattern = '0-0-1';
      }

      // Parse duration
      const durationMatch = text.match(/(\d+)\s*(day|week|month)/i);
      if (durationMatch) {
        rx.duration = `${durationMatch[1]} ${durationMatch[2]}s`;
        rx.durationDays = parseInt(durationMatch[1]) * (durationMatch[2].toLowerCase().startsWith('w') ? 7 : durationMatch[2].toLowerCase().startsWith('m') ? 30 : 1);
      }
    }

    return rx;
  };

  // ===== MEDICINE AUTOCOMPLETE =====
  
  const handleMedicineSearchChange = (index: number, value: string) => {
    setMedicineSearchQuery(value);
    updatePrescriptionRow(index, 'medicine', value);
    setFocusedMedicineIndex(index);
    
    if (value.trim().length > 0) {
      // Use all medicines (common + custom + combinations) for autocomplete
      const suggestions = getAllMedicinesForAutocomplete(value);
      setMedicineSuggestions(suggestions);
      setShowMedicineSuggestions(true);
      setSelectedMedicineSuggestionIndex(-1);
    } else {
      // Show all medicines when field is empty (including database combinations with content)
      const localStorageCombos = getCombinationsWithContent();
      const dbComboMap = new Map(dbCombinations.map(c => [c.name.toLowerCase(), c.content]));
      const localStorageComboMap = new Map(localStorageCombos.map(c => [c.name.toLowerCase(), c.content]));
      
      // Merge all combination names (database takes priority for content)
      const allComboNames = [...new Set([
        ...dbCombinations.map(c => c.name),
        ...localStorageCombos.map(c => c.name)
      ])]; 
      
      const allMeds: {name: string; content?: string}[] = [
        ...getCustomMedicines().map(m => ({ name: m })),
        ...allComboNames.map(c => ({ 
          name: c, 
          content: dbComboMap.get(c.toLowerCase()) || localStorageComboMap.get(c.toLowerCase()) || '' 
        })),
        ...commonMedicines.slice(0, 5).map(m => ({ name: m }))
      ].slice(0, 10);
      setMedicineSuggestions(allMeds);
      setShowMedicineSuggestions(true);
      setSelectedMedicineSuggestionIndex(-1);
    }
  };
  
  const handleMedicineKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    totalRows: number
  ) => {
    // Handle Enter key - always prevent default to avoid form submission
    if (e.key === 'Enter') {
      e.preventDefault();
      // If suggestions are shown, select current or first, then move to next field
      if (showMedicineSuggestions && medicineSuggestions.length > 0) {
        const choice = selectedMedicineSuggestionIndex >= 0 ? medicineSuggestions[selectedMedicineSuggestionIndex] : medicineSuggestions[0];
        if (choice) {
          selectMedicine(index, choice);
        }
      }
      setShowMedicineSuggestions(false);
      setSelectedMedicineSuggestionIndex(-1);
      setFocusedMedicineIndex(null);
      focusNextFieldInRow(e);
      return;
    }
    
    // Handle other keys when suggestions are shown
    if (showMedicineSuggestions) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedMedicineSuggestionIndex(prev => 
            prev < medicineSuggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedMedicineSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
        case 'Tab':
          if (selectedMedicineSuggestionIndex >= 0 && medicineSuggestions[selectedMedicineSuggestionIndex]) {
            e.preventDefault();
            selectMedicine(index, medicineSuggestions[selectedMedicineSuggestionIndex]);
          }
          break;
        case 'Escape':
          setShowMedicineSuggestions(false);
          setSelectedMedicineSuggestionIndex(-1);
          setFocusedMedicineIndex(null);
          break;
      }
    }
  };
  
  const selectMedicine = (index: number, suggestion: {name: string; content?: string}) => {
    const medicine = suggestion.name;
    const isCombination = !!suggestion.content;
    
    setPrescriptions(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        medicine: medicine,
        isCombination: isCombination,
        combinationName: isCombination ? medicine : undefined,
        combinationContent: suggestion.content || undefined,
      };
      return updated;
    });
    
    setShowMedicineSuggestions(false);
    setMedicineSuggestions([]);
    setSelectedMedicineSuggestionIndex(-1);
    setMedicineSearchQuery('');
    setFocusedMedicineIndex(null);
    
    // Try to load saved pattern for this medicine
    const savedPattern = getMedicinePattern(medicine, '');
    if (savedPattern) {
      setPrescriptions(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          quantity: savedPattern.quantity,
          doseForm: savedPattern.doseForm,
          dosePattern: savedPattern.dosePattern,
          frequency: savedPattern.frequency,
          duration: savedPattern.duration,
        };
        return updated;
      });
    } else {
      // No saved pattern - try smart parsing on the medicine name
      const parsed = parseSmartEntry(medicine, smartParsingRules);
      if (parsed.medicine) {
        setPrescriptions(prev => {
          const updated = [...prev];
          updated[index] = { 
            ...updated[index], 
            medicine: medicine, // Keep original medicine name
            quantity: parsed.quantity,
            doseForm: parsed.doseForm,
            dosePattern: parsed.dosePattern,
            frequency: parsed.frequency,
            duration: parsed.duration,
          };
          return updated;
        });
      }
    }
  };
  
  const handlePotencyKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    totalRows: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Move to next field (do not add new row here)
      focusNextFieldInRow(e);
    }
  };

  const focusNextFieldInRow = (e: React.KeyboardEvent) => {
    const target = e.currentTarget as HTMLElement;
    const tr = target.closest('tr');
    if (!tr) return;
    const fields = Array.from(tr.querySelectorAll('input, select')) as HTMLElement[];
    const i = fields.findIndex((el) => el === target);
    if (i >= 0 && i < fields.length - 1) {
      (fields[i + 1] as HTMLElement).focus();
    }
  };

  const handleGenericEnterMove = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      focusNextFieldInRow(e);
    }
  };

  const handleBottlesKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number, totalRows: number) => {
    const input = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      // On last field, Enter adds a new row and focuses first field
      if (index === totalRows - 1) {
        addEmptyPrescriptionRow();
        setTimeout(() => {
          try {
            const table = input.closest('table');
            const lastRow = table?.querySelector('tbody tr:last-child');
            const firstField = lastRow?.querySelector('input, select') as HTMLElement | null;
            firstField?.focus();
          } catch {}
        }, 0);
      } else {
        focusNextFieldInRow(e);
      }
    } else if (e.key === 'Backspace') {
      // Allow clearing the field completely
      if (input.value.length <= 1) {
        e.preventDefault();
        updatePrescriptionRow(index, 'bottles', undefined as unknown as number);
        // Set input's value to empty string visually; React will reflect from state update
        setTimeout(() => {
          input.value = '';
        }, 0);
      }
    }
  };
  const handleOpenCombination = (index: number) => {
    // Toggle inline editing for combination
    if (editingCombinationIndex === index) {
      // Close if already open
      setEditingCombinationIndex(null);
      setCombinationName('');
      setCombinationContent('');
    } else {
      // Open for editing
      setEditingCombinationIndex(index);
      setCombinationName(prescriptions[index].combinationName || prescriptions[index].medicine || '');
      setCombinationContent(prescriptions[index].combinationContent || '');
    }
  };

  const saveCombination = async () => {
    if (editingCombinationIndex !== null) {
      setPrescriptions(prev => {
        const updated = [...prev];
        updated[editingCombinationIndex] = {
          ...updated[editingCombinationIndex],
          isCombination: true,
          combinationName,
          combinationContent,
          medicine: combinationName,
        };
        return updated;
      });
      
      // Save combination to database for autocomplete with content
      if (combinationName.trim() && combinationContent.trim()) {
        try {
          // Check if combination already exists in database
          const existingCombo = dbCombinations.find(c => c.name.toLowerCase() === combinationName.toLowerCase());
          
          if (existingCombo) {
            // Update existing combination
            await fetch('/api/doctor-panel/combinations', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                id: (existingCombo as { id?: string }).id || existingCombo.name,
                name: combinationName,
                content: combinationContent 
              }),
            });
          } else {
            // Create new combination in database
            await fetch('/api/doctor-panel/combinations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: combinationName,
                content: combinationContent,
              }),
            });
          }
          
          // Refresh dbCombinations state
          const response = await fetch('/api/doctor-panel/combinations');
          const data = await response.json();
          if (Array.isArray(data)) {
            setDbCombinations(data.map((c: { name: string; content: string }) => ({ name: c.name, content: c.content })));
          }
        } catch (error) {
          console.error('Failed to save combination to database:', error);
        }
        
        // Also save to localStorage as backup with content
        saveCombinationName(combinationName, combinationContent);
      } else if (combinationName.trim()) {
        // Save name only if no content
        saveCombinationName(combinationName, '');
      }
    }
    setEditingCombinationIndex(null);
    setCombinationName('');
    setCombinationContent('');
  };

  const cancelCombination = () => {
    setEditingCombinationIndex(null);
    setCombinationName('');
    setCombinationContent('');
  };
  
  // ===== SMART PARSING =====
  
  // Track if user is actively focused on the smart parse field
  const [isSmartParseActive, setIsSmartParseActive] = useState(false);
  
  // Keep focus on smart parse input after parsing, but only if user is actively using it
  useEffect(() => {
    if (smartParseInput === '' && smartParseInputRef.current && isSmartParseActive) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        smartParseInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [prescriptions, smartParseInput, isSmartParseActive]);
  
  const handleSmartParse = (index: number) => {
    const rx = prescriptions[index];
    if (rx.medicine.trim()) {
      const parsed = parseSmartEntry(rx.medicine, smartParsingRules);
      setPrescriptions(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], ...parsed };
        return updated;
      });
    }
  };
  
  // Handle smart parsing input field - parse and add new row on Enter
  const handleSmartParseInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSmartParseSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSmartParseSelectedIndex(prev => prev < smartParseSuggestions.length - 1 ? prev + 1 : prev);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSmartParseSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        const choice = smartParseSelectedIndex >= 0 ? smartParseSuggestions[smartParseSelectedIndex] : (smartParseSuggestions[0] || '');
        if (choice.trim()) {
          const nextHistory = smartParseHistory.filter(line => line.trim() !== choice.trim());
          setSmartParseHistory(nextHistory);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('smartParseHistory', JSON.stringify(nextHistory));
            } catch {}
          }
          const nextSuggestions = smartParseSuggestions.filter(s => s.trim() !== choice.trim());
          setSmartParseSuggestions(nextSuggestions);
          setSmartParseSelectedIndex(-1);
          setShowSmartParseSuggestions(nextSuggestions.length > 0);
        }
        return;
      }
    if (e.key === 'Enter') {
      e.preventDefault();
      const choice = smartParseSelectedIndex >= 0 ? smartParseSuggestions[smartParseSelectedIndex] : (smartParseSuggestions[0] || '');
      if (choice.trim()) {
        // Fill the smart parsing field with selected suggestion without parsing
        setSmartParseInput(choice.trim());
        setShowSmartParseSuggestions(false);
        setSmartParseSuggestions([]);
        setSmartParseSelectedIndex(-1);
        setTimeout(() => {
          smartParseInputRef.current?.focus();
        }, 0);
        return;
      }
    }
    }
    if (e.key === 'Enter' && smartParseInput.trim()) {
      e.preventDefault();
      
      // If AI parsing is enabled and API key is available, use AI
      if (aiParsingEnabled && aiApiKey) {
        setIsAiParsing(true);
        try {
          const response = await fetch('/api/parse-prescription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: smartParseInput,
              useAI: true,
              apiKey: aiApiKey,
            }),
          });
          
          const data = await response.json();
          
          if (data.success && data.data) {
            const parsed = data.data;
            const newPrescription: Prescription = {
              medicine: parsed.medicineName || smartParseInput.trim(),
              potency: parsed.potency || '',
              quantity: parsed.quantity || '1dr',
              doseForm: parsed.doseForm || 'pills',
              dosePattern: parsed.pattern || '1-1-1',
              frequency: parsed.frequency || 'Daily',
              duration: parsed.duration || '7 days',
              durationDays: parsed.duration ? parseInt(parsed.duration) * (parsed.duration.includes('week') ? 7 : parsed.duration.includes('month') ? 30 : 1) : 7,
              bottles: 1,
            };
            
            setPrescriptions(prev => [...prev, newPrescription]);
            
            if (newPrescription.medicine) {
              saveCustomMedicine(newPrescription.medicine);
              if (newPrescription.potency) {
                saveMedicineToMemory(newPrescription.medicine, newPrescription.potency, newPrescription);
              }
            }
            
            setSmartParseInput('');
            try {
              const next = Array.from(new Set([smartParseInput.trim(), ...smartParseHistory]));
              setSmartParseHistory(next);
              if (typeof window !== 'undefined') {
                localStorage.setItem('smartParseHistory', JSON.stringify(next));
              }
            } catch {}
            setTimeout(() => {
              smartParseInputRef.current?.focus();
            }, 0);
            return;
          }
        } catch (error) {
          console.error('AI parsing failed, falling back to regex:', error);
        } finally {
          setIsAiParsing(false);
        }
      }
      
      // Fallback to regex parsing
      const parsed = parseSmartEntry(smartParseInput, smartParsingRules);
      
      // Add new prescription row with parsed values
      const newPrescription: Prescription = {
        medicine: parsed.medicine || smartParseInput.trim(),
        potency: parsed.potency || '',
        quantity: parsed.quantity || '1dr',
        doseForm: parsed.doseForm || 'pills',
        dosePattern: parsed.dosePattern || '1-1-1',
        frequency: parsed.frequency || 'Daily',
        duration: parsed.duration || '7 days',
        durationDays: parsed.durationDays || 7,
        bottles: parsed.bottles || 1,
      };
      
      setPrescriptions(prev => [...prev, newPrescription]);
      
      // Save medicine to memory and custom list
      if (newPrescription.medicine) {
        saveCustomMedicine(newPrescription.medicine);
        if (newPrescription.potency) {
          saveMedicineToMemory(newPrescription.medicine, newPrescription.potency, newPrescription);
        }
      }
      
      // Clear input and keep focus
      setSmartParseInput('');
      try {
        const next = Array.from(new Set([smartParseInput.trim(), ...smartParseHistory]));
        setSmartParseHistory(next);
        if (typeof window !== 'undefined') {
          localStorage.setItem('smartParseHistory', JSON.stringify(next));
        }
      } catch {}
      setTimeout(() => {
        smartParseInputRef.current?.focus();
      }, 0);
    }
  };

  // ===== SAVE FEE =====
  
  // Normalize fee type to standard format for fee history
  const normalizeFeeType = (feeTypeName: string): 'first-visit' | 'follow-up' | 'exempt' | 'consultation' | 'medicine' => {
    const normalized = feeTypeName.toLowerCase().trim();
    
    // Check for keywords in the fee type name
    if (normalized.includes('new') || normalized.includes('first')) {
      return 'first-visit';
    } else if (normalized.includes('follow')) {
      return 'follow-up';
    } else if (normalized.includes('exempt')) {
      return 'exempt';
    } else if (normalized.includes('medicine')) {
      return 'medicine';
    } else {
      return 'consultation';
    }
  };
  
  const handleSaveFee = () => {
    console.log('[DoctorPanel] ========== handleSaveFee CALLED ==========');
    
    if (!patient) return;
    
    // Find today's appointment for this patient (declare early)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const appointments = appointmentDb.getByPatient(patient.id) as Appointment[];
    const todayAppointment = appointments.find((apt: Appointment) => {
      const aptDate = new Date(apt.appointmentDate);
      return aptDate >= today && aptDate <= todayEnd;
    });
    
    console.log('[DoctorPanel] Current state:', {
      patient: patient?.id,
      feeAmount,
      feeType,
      feeTypeId,
      paymentStatus,
      savedVisitId,
      appointmentId: todayAppointment?.id
    });
    
    const feeAmountNum = parseFloat(feeAmount) || 0;
    const discountPercentNum = parseFloat(discountPercent) || 0;
    
    console.log('[DoctorPanel] handleSaveFee - Found todayAppointment:', todayAppointment?.id, 'feeAmount:', todayAppointment?.feeAmount);
    
    // Update or create fee record
    let feeRecordId = currentAppointmentFee?.feeId;
    
    if (feeRecordId) {
      // Update existing fee record
      feesDb.update(feeRecordId, {
        amount: feeAmountNum,
        feeType: feeType,
        paymentStatus: paymentStatus,
        discountPercent: discountPercentNum,
        discountReason: discountReason,
        updatedAt: new Date(),
      });
    } else {
      // Create new fee record
      const newFee = feesDb.create({
        patientId: patient.id,
        amount: feeAmountNum,
        feeType: feeType,
        paymentStatus: paymentStatus,
        discountPercent: discountPercentNum,
        discountReason: discountReason,
        paymentMethod: '',
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      feeRecordId = newFee.id;
    }
    
    // Update the appointment with new fee information
    if (todayAppointment) {
      appointmentDb.update(todayAppointment.id, {
        feeStatus: paymentStatus,
        feeAmount: feeAmountNum,
        feeType: feeType,
        feeId: feeRecordId,
        isFreeFollowUp: (feeType === 'Free Follow Up') || (feeType === 'Follow Up' && feeAmountNum === 0),
      });
    }
    
    // Sync fee changes to billing queue if patient is already there
    const existingBillingItems = billingQueueDb.getAll() as any[];
    const patientBillingItem = existingBillingItems.find(
      (item) => item.patientId === patient.id && 
                (item.status === 'pending' || item.status === 'paid') &&
                (item.appointmentId === todayAppointment?.id || 
                 (todayAppointment && new Date(item.createdAt).toDateString() === new Date().toDateString()))
    );
    
    if (patientBillingItem) {
      // Preserve existing receiptNumber when updating amount
      const updateData: any = {
        feeAmount: feeAmountNum,
        feeType: feeType,
        netAmount: feeAmountNum - (patientBillingItem.discountAmount || 0),
        paymentStatus: paymentStatus,
        updatedAt: new Date(),
      };
      
      // Only update receiptNumber if it already exists (preserve it)
      if (patientBillingItem.receiptNumber) {
        console.log('[DoctorPanel] Preserving existing receiptNumber:', patientBillingItem.receiptNumber);
        // Don't regenerate - just keep the existing one
      }
      
      billingQueueDb.update(patientBillingItem.id, updateData);
      console.log('[DoctorPanel] Synced fee to billing queue:', patientBillingItem.id, 'preserving receiptNumber:', patientBillingItem.receiptNumber);
    }
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fees-updated', { detail: { patientId: patient.id, visitId: todayAppointment?.id } }));
    }
    
    // Update the visible fee info immediately
    setCurrentAppointmentFee(prev => prev ? {
      ...prev,
      feeId: feeRecordId,
      feeAmount: feeAmountNum,
      feeType: feeType,
      feeStatus: paymentStatus,
    } : null);
    
    // Update last fee info based on payment status
    if (paymentStatus === 'paid') {
      setLastFeeInfo({
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: feeAmountNum,
        daysAgo: 0,
        feeType: feeType,
        status: 'paid',
      });
      
      // Add to fee history when paid
      const existingFeeHistory = db.getAll('feeHistory') as FeeHistoryEntry[];
      
      console.log('[DoctorPanel] ========== FEE HISTORY SAVE START ==========');
      console.log('[DoctorPanel] Looking for existing fee history. Criteria:', {
        patientId: patient.id,
        savedVisitId,
        appointmentId: todayAppointment?.id,
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      // CRITICAL: Find ANY existing fee history for this patient TODAY
      // This prevents duplicate entries when prescription is recreated
      const todayFeeHistory = existingFeeHistory.find((fh) => {
        if (fh.patientId !== patient.id) return false;
        
        const fhDate = new Date(fh.paidDate);
        fhDate.setHours(0, 0, 0, 0);
        
        // Match if same patient AND same day (regardless of visitId)
        return fhDate.getTime() === today.getTime();
      });
      
      console.log('[DoctorPanel] Found existing fee history?', !!todayFeeHistory, todayFeeHistory?.id);
      
      if (!todayFeeHistory) {
        // Only create NEW entry if one doesn't exist
        const newFeeHistoryId = `fh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const normalizedFeeType = normalizeFeeType(feeType);
        
        feeHistoryDb.create({
          id: newFeeHistoryId,
          patientId: patient.id,
          visitId: savedVisitId || todayAppointment?.id,
          receiptId: `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          feeType: normalizedFeeType,
          amount: feeAmountNum,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          paidDate: new Date(),
          daysSinceLastFee: lastFeeInfo ? lastFeeInfo.daysAgo : undefined,
        });
        console.log('[DoctorPanel] ✅ CREATED NEW fee history entry:', newFeeHistoryId, 'amount:', feeAmountNum);
      } else {
        // UPDATE existing entry - don't create a new one
        const normalizedFeeType = normalizeFeeType(feeType);
        
        feeHistoryDb.update(todayFeeHistory.id, {
          amount: feeAmountNum,
          feeType: normalizedFeeType,
          visitId: savedVisitId || todayFeeHistory.visitId,
          paymentStatus: 'paid',
          updatedAt: new Date(),
        });
        console.log('[DoctorPanel] ✏️ UPDATED existing fee history entry:', todayFeeHistory.id, 'New amount:', feeAmountNum);
      }
      
      console.log('[DoctorPanel] ========== FEE HISTORY SAVE END ==========');
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fees-updated', { detail: { patientId: patient.id, visitId: savedVisitId || todayAppointment?.id } }));
      }
    } else if (paymentStatus === 'pending') {
      setLastFeeInfo({
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: feeAmountNum,
        daysAgo: 0,
        feeType: feeType,
        status: 'pending',
      });
    } else if (paymentStatus === 'exempt') {
      // For exempt status, clear the last fee info or keep it as is
      setLastFeeInfo(prev => prev ? { ...prev, status: undefined } : null);
    }
    
    // Collapse the form after saving
    setShowFeeForm(false);
    
    // Show success feedback (could add a toast notification here)
    console.log('Fee saved successfully');
  };

  // ===== NEXT VISIT CALCULATIONS =====
  
  // Calculate next visit date from days
  const handleNextVisitDaysChange = (days: string) => {
    setNextVisitDays(days);
    const daysNum = parseInt(days);
    if (!isNaN(daysNum) && daysNum > 0) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + daysNum);
      setNextVisit(nextDate.toISOString().split('T')[0]);
    }
  };
  
  // Calculate days from next visit date
  const handleNextVisitDateChange = (date: string) => {
    setNextVisit(date);
    if (date) {
      const nextDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = nextDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        setNextVisitDays(String(diffDays));
      } else {
        setNextVisitDays('');
      }
    }
  };
  
  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !patient) return;
    
    const newFiles: Array<{ name: string; type: string; data: string; remarks?: string; originalType?: string }> = [];
    let filesProcessed = 0;
    
    // Function to compress image
    const compressImage = (file: File, callback: (data: string) => void) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Resize if image is too large
          const maxWidth = 1200;
          const maxHeight = 1200;
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
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress with quality 0.7 for JPEG
            const compressedData = canvas.toDataURL('image/jpeg', 0.7);
            callback(compressedData);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    };
    
    Array.from(files).forEach((file) => {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        alert(`Invalid file type: ${file.name}. Only images (JPG, PNG, GIF) and PDFs are allowed.`);
        filesProcessed++;
        if (filesProcessed === Array.from(files).length) {
          e.target.value = '';
        }
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`File too large: ${file.name}. Maximum size is 10MB.`);
        filesProcessed++;
        if (filesProcessed === Array.from(files).length) {
          e.target.value = '';
        }
        return;
      }
      
      // Compress images, keep PDFs as-is
      if (file.type.startsWith('image/')) {
        compressImage(file, (compressedData) => {
          newFiles.push({
            name: file.name,
            type: 'image/jpeg', // Convert to JPEG after compression
            data: compressedData,
            originalType: file.type // Store original file type
          });
          filesProcessed++;
          
          if (filesProcessed === Array.from(files).length) {
            setUploadedFiles((prev) => [...prev, ...newFiles]);
            
            // Save to investigations database
            newFiles.forEach((file) => {
              // Extract file extension from original type
              const fileExtension = file.originalType?.split('/')[1] || 'jpeg';
              investigationDb.create({
                id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                patientId: patient.id,
                fileName: file.name,
                fileType: fileExtension as 'pdf' | 'jpg' | 'jpeg' | 'png' | 'webp',
                fileSize: file.data.length,
                fileUrl: file.data,
                title: file.name,
                description: file.remarks || '',
                investigationDate: new Date(),
                uploadedBy: getCurrentUser()?.name || 'Doctor',
                uploadedAt: new Date(),
              });
            });
            
            e.target.value = '';
          }
        });
      } else {
        // For PDFs, read as-is
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            newFiles.push({
              name: file.name,
              type: file.type,
              data: event.target.result as string,
              originalType: file.type
            });
            filesProcessed++;
            
            if (filesProcessed === Array.from(files).length) {
              setUploadedFiles((prev) => [...prev, ...newFiles]);
              
              // Save to investigations database
              newFiles.forEach((file) => {
                investigationDb.create({
                  id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  patientId: patient.id,
                  fileName: file.name,
                  fileType: 'pdf',
                  fileSize: file.data.length,
                  fileUrl: file.data,
                  title: file.name,
                  description: file.remarks || '',
                  investigationDate: new Date(),
                  uploadedBy: getCurrentUser()?.name || 'Doctor',
                  uploadedAt: new Date(),
                });
              });
              
              e.target.value = '';
            }
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };
  
  // Handle file removal
  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    if (editingGridFileIndex === index) {
      setEditingGridFileIndex(null);
      setEditingName('');
      setEditingRemarks('');
    }
  };

  // Handle file rename
  const handleRenameFile = (index: number) => {
    setEditingGridFileIndex(index);
    setEditingName(uploadedFiles[index].name);
    setEditingRemarks(uploadedFiles[index].remarks || '');
  };

  // Save file rename and remarks
  const handleSaveFileEdit = (index: number) => {
    if (editingName.trim()) {
      setUploadedFiles((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          name: editingName.trim(),
          remarks: editingRemarks.trim(),
        };
        return updated;
      });
    }
    setEditingGridFileIndex(null);
    setEditingName('');
    setEditingRemarks('');
  };

  // Cancel file edit
  const handleCancelFileEdit = () => {
    setEditingGridFileIndex(null);
    setEditingName('');
    setEditingRemarks('');
  };
  
  // Save field order to localStorage
  const saveFieldOrder = (newOrder: string[]) => {
    setAdditionalNotesFieldOrder(newOrder);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doctor_panel_field_order', JSON.stringify(newOrder));
    }
  };
  
  // Move field up in order
  const moveFieldUp = (field: string) => {
    const currentIndex = additionalNotesFieldOrder.indexOf(field);
    if (currentIndex > 0) {
      const newOrder = [...additionalNotesFieldOrder];
      [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
      saveFieldOrder(newOrder);
    }
  };
  
  // Move field down in order
  const moveFieldDown = (field: string) => {
    const currentIndex = additionalNotesFieldOrder.indexOf(field);
    if (currentIndex < additionalNotesFieldOrder.length - 1) {
      const newOrder = [...additionalNotesFieldOrder];
      [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
      saveFieldOrder(newOrder);
    }
  };

  // ===== END CONSULTATION =====

  const handleEndConsultation = async () => {
    if (!currentVisit || !patient) return;
    
    // Validate next visit is mandatory
    if (!nextVisit) {
      alert('Next visit date is mandatory. Please select a date or enter number of days.');
      return;
    }

    // Save visit data with locked status
    const visitData = {
      patientId: patient.id,
      visitDate: new Date(),
      visitNumber: currentVisit.visitNumber,
      chiefComplaint: caseText.split('\n')[0] || '',
      caseText,
      diagnosis,
      advice,
      testsRequired,
      nextVisit: nextVisit ? new Date(nextVisit) : undefined,
      prognosis,
      remarksToFrontdesk,
      bp: bp || undefined,
      pulse: pulse || undefined,
      tempF: tempF || undefined,
      weightKg: weightKg || undefined,
      status: 'locked' as const, // Lock the visit
    };

    let visitIdToUse: string;
    if (savedVisitId) {
      doctorVisitDb.update(savedVisitId, visitData);
      visitIdToUse = savedVisitId;
    } else {
      const savedVisit = doctorVisitDb.create(visitData);
      setSavedVisitId(savedVisit.id);
      visitIdToUse = savedVisit.id;
    }

    // Save prescriptions
    const prescriptionIds: string[] = [];
    const existingRx = doctorPrescriptionDb.getByVisit(visitIdToUse);
    prescriptions.forEach((rx, index) => {
      if (!rx.medicine.trim()) return;
      if (index < existingRx.length) {
        const existing = existingRx[index];
        doctorPrescriptionDb.update(existing.id, {
          patientId: patient.id,
          medicine: rx.medicine,
          potency: rx.potency,
          quantity: rx.quantity,
          doseForm: rx.doseForm,
          dosePattern: rx.dosePattern,
          frequency: rx.frequency,
          duration: rx.duration,
          durationDays: rx.durationDays,
          bottles: rx.bottles,
          instructions: rx.instructions,
          rowOrder: index,
          isCombination: rx.isCombination,
          combinationName: rx.combinationName,
          combinationContent: rx.combinationContent,
        });
        prescriptionIds.push(existing.id);
      } else {
        const created = doctorPrescriptionDb.create({
          visitId: visitIdToUse,
          patientId: patient.id,
          medicine: rx.medicine,
          potency: rx.potency,
          quantity: rx.quantity,
          doseForm: rx.doseForm,
          dosePattern: rx.dosePattern,
          frequency: rx.frequency,
          duration: rx.duration,
          durationDays: rx.durationDays,
          bottles: rx.bottles,
          instructions: rx.instructions,
          rowOrder: index,
          isCombination: rx.isCombination,
          combinationName: rx.combinationName,
          combinationContent: rx.combinationContent,
        });
        prescriptionIds.push(created.id);
      }
    });

    // Save/update fee record
    const feeAmountNum = parseFloat(feeAmount) || 0;
    const discountPercentNum = parseFloat(discountPercent) || 0;
    const finalAmount = feeAmountNum - (feeAmountNum * discountPercentNum / 100);
    
    if (currentAppointmentFee?.feeId) {
      // Update existing fee record
      feesDb.update(currentAppointmentFee.feeId, {
        amount: feeAmountNum,
        feeType: feeType,
        paymentStatus: paymentStatus,
        discountPercent: discountPercentNum,
        discountReason: discountReason,
        notes: remarksToFrontdesk,
        updatedAt: new Date(),
      });
    } else {
      // Create new fee record
      feesDb.create({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        patientId: patient.id,
        visitId: visitIdToUse,
        amount: feeAmountNum,
        feeType: feeType,
        paymentStatus: paymentStatus,
        discountPercent: discountPercentNum,
        discountReason: discountReason,
        paymentMethod: '',
        notes: remarksToFrontdesk,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // If fee is paid, add to fee history (check for duplicates first)
    if (paymentStatus === 'paid') {
      const existingFeeHistory = db.getAll('feeHistory') as FeeHistoryEntry[];
      
      // CRITICAL: Check if ANY fee history entry exists for this patient TODAY
      // This prevents duplicate entries when prescription is recreated
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Find ANY existing fee history for this patient on today's date
      const existingTodayFee = existingFeeHistory.find((fh) => {
        if (fh.patientId !== patient.id) return false;
        
        const fhDate = new Date(fh.paidDate);
        fhDate.setHours(0, 0, 0, 0);
        
        // Match if same patient AND same day (regardless of visitId)
        return fhDate.getTime() === today.getTime();
      });
      
      if (!existingTodayFee) {
        // Only create NEW entry if NO fee exists for this patient today
        const normalizedFeeType = normalizeFeeType(feeType);
        feeHistoryDb.create({
          id: `fh-${Date.now()}`,
          patientId: patient.id,
          visitId: visitIdToUse,
          receiptId: `RCP-${Date.now()}`,
          feeType: normalizedFeeType,
          amount: finalAmount,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          paidDate: new Date(),
          daysSinceLastFee: lastFeeInfo ? lastFeeInfo.daysAgo : undefined,
        });
        console.log('[DoctorPanel] handleEndConsultation - Created NEW fee history entry for patient:', patient.id);
      } else {
        // Update existing entry - don't create a new one
        const normalizedFeeType = normalizeFeeType(feeType);
        feeHistoryDb.update(existingTodayFee.id, {
          amount: finalAmount,
          feeType: normalizedFeeType,
          visitId: visitIdToUse,
          paymentStatus: 'paid',
          updatedAt: new Date(),
        });
        console.log('[DoctorPanel] handleEndConsultation - UPDATED existing fee history entry:', existingTodayFee.id, 'for patient:', patient.id);
      }
    }

    // Update appointment fee status if exists
    if (currentAppointmentFee?.feeId) {
      const appointments = appointmentDb.getAll() as Appointment[];
      const todayAppt = appointments.find((apt: Appointment) => 
        apt.feeId === currentAppointmentFee.feeId
      );
      if (todayAppt) {
        appointmentDb.update(todayAppt.id, {
          feeStatus: paymentStatus,
          feeAmount: feeAmountNum,
          feeType: feeType,
          isFreeFollowUp: (feeType === 'Free Follow Up') || (feeType === 'Follow Up' && feeAmountNum === 0),
        });
      }
    }
    
    // Sync fee changes to billing queue if patient is already there
    const existingBillingItems = billingQueueDb.getAll() as any[];
    const patientBillingItem = existingBillingItems.find(
      (item) => item.patientId === patient.id && 
                (item.status === 'pending' || item.status === 'paid') &&
                (item.appointmentId === currentAppointmentFee?.appointmentId || 
                 new Date(item.createdAt).toDateString() === new Date().toDateString())
    );
    
    if (patientBillingItem) {
      const updateData: any = {
        feeAmount: feeAmountNum,
        feeType: feeType,
        netAmount: feeAmountNum - (patientBillingItem.discountAmount || 0),
        paymentStatus: paymentStatus,
        updatedAt: new Date(),
      };
      
      // Preserve existing receiptNumber when updating amount
      if (patientBillingItem.receiptNumber) {
        console.log('[DoctorPanel] Preserving existing receiptNumber on end consultation:', patientBillingItem.receiptNumber);
        // Don't regenerate - just keep the existing one
      }
      
      billingQueueDb.update(patientBillingItem.id, updateData);
      console.log('[DoctorPanel] Synced fee to billing queue on end consultation:', patientBillingItem.id);
    }
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fees-updated', { detail: { patientId: patient.id, visitId: savedVisitId } }));
    }

    // Mark consultation as ended and show preview popup
    setIsConsultationEnded(true);
    setShowPrescriptionPreview(true);
  };
  
  const handleSaveConsultation = () => {
    if (!patient || !currentVisit) return;
    const pendingInput = symptomInput.trim();
    const finalSymptoms = pendingInput ? [...symptoms, pendingInput] : symptoms;
    const finalCaseText = finalSymptoms.join('\n');
    const visitData = {
      patientId: patient.id,
      visitDate: new Date(),
      visitNumber: currentVisit.visitNumber,
      chiefComplaint: finalCaseText.split('\n')[0] || '',
      caseText: finalCaseText,
      diagnosis,
      advice,
      testsRequired,
      nextVisit: nextVisit ? new Date(nextVisit) : undefined,
      prognosis,
      remarksToFrontdesk,
      bp: bp || undefined,
      pulse: pulse || undefined,
      tempF: tempF || undefined,
      weightKg: weightKg || undefined,
      status: 'active' as const,
    };
    
    // Always update if we have a savedVisitId, never create duplicate
    if (savedVisitId) {
      doctorVisitDb.update(savedVisitId, visitData);
      const existingRx = doctorPrescriptionDb.getByVisit(savedVisitId);
      prescriptions.forEach((rx, index) => {
        if (!rx.medicine.trim()) return;
        if (index < existingRx.length) {
          const existing = existingRx[index];
          doctorPrescriptionDb.update(existing.id, {
            patientId: patient.id,
            medicine: rx.medicine,
            potency: rx.potency,
            quantity: rx.quantity,
            doseForm: rx.doseForm,
            dosePattern: rx.dosePattern,
            frequency: rx.frequency,
            duration: rx.duration,
            durationDays: rx.durationDays,
            bottles: rx.bottles,
            instructions: rx.instructions,
            rowOrder: index,
            isCombination: rx.isCombination,
            combinationName: rx.combinationName,
            combinationContent: rx.combinationContent,
          });
        } else {
          doctorPrescriptionDb.create({
            visitId: savedVisitId,
            patientId: patient.id,
            medicine: rx.medicine,
            potency: rx.potency,
            quantity: rx.quantity,
            doseForm: rx.doseForm,
            dosePattern: rx.dosePattern,
            frequency: rx.frequency,
            duration: rx.duration,
            durationDays: rx.durationDays,
            bottles: rx.bottles,
            instructions: rx.instructions,
            rowOrder: index,
            isCombination: rx.isCombination,
            combinationName: rx.combinationName,
            combinationContent: rx.combinationContent,
          });
        }
      });
    } else {
      // Check if a visit already exists for this patient today before creating
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const allVisits = doctorVisitDb.getByPatient(patient.id) as DoctorVisit[];
      const todayVisit = allVisits.find((v) => {
        const vDate = new Date(v.visitDate);
        return vDate >= today && vDate <= todayEnd && v.status === 'active';
      });
      
      if (todayVisit) {
        // Use existing visit instead of creating duplicate
        console.log('[DoctorPanel] Using existing visit instead of creating duplicate:', todayVisit.id);
        setSavedVisitId(todayVisit.id);
        doctorVisitDb.update(todayVisit.id, visitData);
        
        const existingRx = doctorPrescriptionDb.getByVisit(todayVisit.id);
        prescriptions.forEach((rx, index) => {
          if (!rx.medicine.trim()) return;
          if (index < existingRx.length) {
            doctorPrescriptionDb.update(existingRx[index].id, {
              patientId: patient.id,
              medicine: rx.medicine,
              potency: rx.potency,
              quantity: rx.quantity,
              doseForm: rx.doseForm,
              dosePattern: rx.dosePattern,
              frequency: rx.frequency,
              duration: rx.duration,
              durationDays: rx.durationDays,
              bottles: rx.bottles,
              instructions: rx.instructions,
              rowOrder: index,
              isCombination: rx.isCombination,
              combinationName: rx.combinationName,
              combinationContent: rx.combinationContent,
            });
          } else {
            doctorPrescriptionDb.create({
              visitId: todayVisit.id,
              patientId: patient.id,
              medicine: rx.medicine,
              potency: rx.potency,
              quantity: rx.quantity,
              doseForm: rx.doseForm,
              dosePattern: rx.dosePattern,
              frequency: rx.frequency,
              duration: rx.duration,
              durationDays: rx.durationDays,
              bottles: rx.bottles,
              instructions: rx.instructions,
              rowOrder: index,
              isCombination: rx.isCombination,
              combinationName: rx.combinationName,
              combinationContent: rx.combinationContent,
            });
          }
        });
      } else {
        // No existing visit, create new one
        const savedVisit = doctorVisitDb.create(visitData);
        setSavedVisitId(savedVisit.id);
        prescriptions.forEach((rx, index) => {
          if (rx.medicine.trim()) {
            doctorPrescriptionDb.create({
              visitId: savedVisit.id,
              patientId: patient.id,
              medicine: rx.medicine,
              potency: rx.potency,
              quantity: rx.quantity,
              doseForm: rx.doseForm,
              dosePattern: rx.dosePattern,
              frequency: rx.frequency,
              duration: rx.duration,
              durationDays: rx.durationDays,
              bottles: rx.bottles,
              instructions: rx.instructions,
              rowOrder: index,
              isCombination: rx.isCombination,
              combinationName: rx.combinationName,
              combinationContent: rx.combinationContent,
            });
          }
        });
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pharmacy-queue-updated'));
    }
    setShowSaveNotice(true);
    setTimeout(() => setShowSaveNotice(false), 3000);
    // Update today's appointment to case taking (in-progress)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const appointments = appointmentDb.getByPatient(patient.id) as Appointment[];
    const todayAppointment = appointments.find((apt: Appointment) => {
      const aptDate = new Date(apt.appointmentDate);
      return aptDate >= today && aptDate <= todayEnd && 
             (apt.status === 'checked-in' || apt.status === 'scheduled' || apt.status === 'in-progress');
    });
    if (todayAppointment && todayAppointment.status !== 'in-progress') {
      appointmentDb.update(todayAppointment.id, { status: 'in-progress' });
    }
  };

  // Send prescription to pharmacy queue
  const handleSendToPharmacy = () => {
    if (!savedVisitId || !patient) return;
    
    console.log('[DoctorPanel] Sending to pharmacy, currentAppointmentFee:', currentAppointmentFee);
    console.log('[DoctorPanel] appointmentId being passed:', currentAppointmentFee?.appointmentId);
    
    // If currentAppointmentFee is not set, try to find the appointment now
    let appointmentIdToUse = currentAppointmentFee?.appointmentId;
    
    if (!appointmentIdToUse && patient) {
      // Fallback: Find today's appointment for this patient
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const appointments = appointmentDb.getByPatient(patient.id) as Appointment[];
      const todayAppointment = appointments.find((apt: Appointment) => {
        const aptDate = new Date(apt.appointmentDate);
        return aptDate >= today && aptDate <= todayEnd && 
               (apt.status === 'checked-in' || apt.status === 'in-progress' || apt.status === 'scheduled');
      });
      
      if (todayAppointment) {
        appointmentIdToUse = todayAppointment.id;
        console.log('[DoctorPanel] Fallback: Found appointmentId:', appointmentIdToUse);
      }
    }
    
    // Reuse existing queue item if present to preserve preparedPrescriptionIds
    const existingQueueItem = pharmacyQueueDb.getByVisit(savedVisitId);
    if (existingQueueItem) {
      pharmacyQueueDb.update(existingQueueItem.id, {
        status: 'pending',
      });
    } else {
      // Add to pharmacy queue with appointment ID
      pharmacyQueueDb.create({
        visitId: savedVisitId,
        patientId: patient.id,
        appointmentId: appointmentIdToUse,
        prescriptionIds: [],
        priority: false,
        status: 'pending',
      });
    }
    
    setPharmacySent(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pharmacy-queue-updated'));
    }
    // Update today's appointment status to medicines-prepared (Sent to pharmacy)
    let aptIdToUpdate = currentAppointmentFee?.appointmentId;
    if (!aptIdToUpdate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      const appointments = appointmentDb.getByPatient(patient.id) as Appointment[];
      const todayAppointment = appointments.find((apt: Appointment) => {
        const aptDate = new Date(apt.appointmentDate);
        return aptDate >= today && aptDate <= todayEnd;
      });
      aptIdToUpdate = todayAppointment?.id;
    }
    if (aptIdToUpdate) {
      appointmentDb.update(aptIdToUpdate, { status: 'sent-to-pharmacy' });
    }
  };

  // Bypass pharmacy and send directly to billing
  const handleSendToBilling = () => {
    if (!savedVisitId || !patient) return;

    // 1. Prioritize fee set manually by the doctor in the UI.
    const doctorFeeInput = feeAmount.trim() !== '' ? parseFloat(feeAmount) : null;

    let finalFeeAmount: number;
    let finalFeeType: string = feeType; // Use the feeType from the state
    let finalPaymentStatus: string = paymentStatus; // Use the paymentStatus from the state

    if (doctorFeeInput !== null && !isNaN(doctorFeeInput)) {
      finalFeeAmount = doctorFeeInput;
      console.log(`[DoctorPanel] Using fee from doctor's manual input:`, { amount: finalFeeAmount, type: finalFeeType, status: finalPaymentStatus });
    } else {
      // 2. If no manual input, determine fee from appointment context.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      const appointments = appointmentDb.getByPatient(patient.id) as Appointment[];
      const todayAppointment = appointments.find((apt: Appointment) => {
        const aptDate = new Date(apt.appointmentDate);
        return aptDate >= today && aptDate <= todayEnd && 
               (apt.status === 'checked-in' || apt.status === 'in-progress' || apt.status === 'scheduled');
      });

      if (todayAppointment) {
        const apt = todayAppointment as Appointment & { feeAmount?: number; feeType?: string; feeStatus?: string };
        finalFeeAmount = apt.feeAmount ?? 300; // Default to 300 if feeAmount is null/undefined
        finalFeeType = apt.feeType ?? 'Follow Up';
        finalPaymentStatus = apt.feeStatus ?? 'pending';
        console.log(`[DoctorPanel] Using fee from today's appointment:`, { amount: finalFeeAmount, type: finalFeeType, status: finalPaymentStatus });
      } else {
        // 3. Fallback if no appointment found (e.g., walk-in)
        finalFeeAmount = 300;
        finalFeeType = 'Follow Up';
        finalPaymentStatus = 'pending';
        console.log(`[DoctorPanel] Using fallback fee for walk-in:`, { amount: finalFeeAmount, type: finalFeeType, status: finalPaymentStatus });
      }
    }
    
    // Use appointmentId from state if available
    const appointmentIdToUse = currentAppointmentFee?.appointmentId;

    // Create or update billing queue item (prevent duplicates)
    const existingBillingItems = billingQueueDb.getAll() as any[];
    const existingBillingItem = existingBillingItems.find((item) => 
      item.patientId === patient.id && 
      (item.visitId === savedVisitId || item.appointmentId === appointmentIdToUse) &&
      (item.status === 'pending' || item.status === 'paid')
    );
    
    const billingData = {
      feeAmount: finalFeeAmount,
      feeType: finalFeeType,
      netAmount: finalFeeAmount, // Billing module handles discounts
      paymentStatus: finalPaymentStatus,
      updatedAt: new Date(),
    };

    if (!existingBillingItem) {
      billingQueueDb.create({
        visitId: savedVisitId,
        patientId: patient.id,
        appointmentId: appointmentIdToUse,
        prescriptionIds: [],
        status: 'pending',
        ...billingData
      });
      console.log('[DoctorPanel] ✅ CREATED NEW billing queue entry for patient:', patient.id, billingData);
    } else {
      billingQueueDb.update(existingBillingItem.id, billingData);
      console.log('[DoctorPanel] ✏️ UPDATED existing billing queue entry:', existingBillingItem.id, billingData);
    }
    
    // Update appointment status to medicines-prepared (bypassing pharmacy)
    if (appointmentIdToUse) {
      appointmentDb.update(appointmentIdToUse, { status: 'medicines-prepared' });
    }
    
    setPharmacySent(true);
  };

  // Reset panel for next patient
  const handleResetPanel = () => {
    console.log('[DoctorPanel] handleResetPanel called - clearing localStorage');
    
    // Clear localStorage when doctor panel is emptied
    if (typeof window !== 'undefined') {
      localStorage.removeItem('doctorPanelCurrentPatient');
      localStorage.removeItem('doctorPanelCalledQueueItemId');
      console.log('[DoctorPanel] Cleared doctorPanelCurrentPatient and doctorPanelCalledQueueItemId');
    }
    
    setPatient(null);
    setCurrentVisit(null);
    setPrescriptions([]);
    setCaseText('');
    setSymptoms([]);
    setDiagnosis('');
    setAdvice('');
    setTestsRequired('');
    setNextVisit('');
    setNextVisitDays('');
    setPrognosis('');
    setRemarksToFrontdesk('');
    setFeeAmount('');
    setFeeType('consultation');
    setPaymentStatus('pending');
    setDiscountPercent('');
    setDiscountReason('');
    setShowPrescriptionPreview(false);
    setIsConsultationEnded(false);
    setPharmacySent(false);
    setSavedVisitId(null);
    setCurrentQueueItem(null);
    router.push('/doctor-panel');
  };

  // Handle WhatsApp share - sends prescription as PDF via connected WhatsApp
  const [isWhatsAppSending, setIsWhatsAppSending] = useState(false);

  const handleWhatsAppShare = async () => {
    if (!patient) return;
    setIsWhatsAppSending(true);
    try {
      const { generatePrescriptionPdfFromHTML, sendPrescriptionViaWhatsApp } = await import('@/lib/whatsapp-send-document');
      const doctorName = getCurrentUser()?.name || '';

      const base64 = await generatePrescriptionPdfFromHTML(
        {
          firstName: patient.firstName,
          lastName: patient.lastName,
          registrationNumber: patient.registrationNumber,
          mobileNumber: patient.mobile,
          age: (patient as any).age,
          sex: (patient as any).gender,
        },
        prescriptions.filter(rx => rx.medicine.trim()) as any[],
        {
          chiefComplaint: caseText,
          advice,
          visitDate: new Date(),
          nextVisit: nextVisit || undefined,
        },
        doctorName
      );

      const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      const filename = `Prescription_${patient.firstName}_${patient.lastName}_${dateStr}.pdf`;
      const caption = `Prescription for ${patient.firstName} ${patient.lastName} — ${new Date().toLocaleDateString()}`;

      await sendPrescriptionViaWhatsApp(patient.mobile, base64, filename, caption);
      alert('Prescription sent via WhatsApp successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`WhatsApp send failed: ${msg}`);
    } finally {
      setIsWhatsAppSending(false);
    }
  };

  // Handle Email share
  const handleEmailShare = () => {
    if (!patient) return;
    
    const prescriptionText = prescriptions
      .filter(rx => rx.medicine.trim())
      .map((rx, i) => `${i + 1}. ${rx.medicine} ${rx.potency || ''} - ${rx.dosePattern} for ${rx.duration}`)
      .join('\n');
    
    const subject = encodeURIComponent(`Your Prescription - ${new Date().toLocaleDateString()}`);
    const body = encodeURIComponent(`Dear ${patient.firstName} ${patient.lastName},

Please find your prescription below:

Medicines:
${prescriptionText || 'No medicines prescribed'}

${advice ? `Advice: ${advice}` : ''}
${nextVisit ? `Next Visit: ${new Date(nextVisit).toLocaleDateString()}` : ''}

Thank you for visiting Dr. Homeopathic Clinic!

Best regards,
Dr. Homeopathic Clinic`);
    
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  // Handle Print to Pharmacy (Thermal Printer Format)
  const handlePrintToPharmacy = () => {
    if (!patient) return;
    
    // Load pharmacy print settings from localStorage
    let printerSettings: any = {
      paperWidth: 80,
      autocut: true,
      fontSize: 8,
      lineHeight: 1.0,
      topMargin: 2,
      bottomMargin: 2,
      leftMargin: 2,
      rightMargin: 2,
    };
    
    try {
      const saved = localStorage.getItem('pharmacyPrintSettings');
      if (saved) {
        printerSettings = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load pharmacy print settings:', error);
    }
    
    const prescriptionData = {
      patientName: `${patient.firstName} ${patient.lastName}`,
      registrationNumber: patient.registrationNumber,
      mobileNumber: patient.mobile,
      prescriptions: prescriptions
        .filter(rx => rx.medicine.trim())
        .map(rx => ({
          medicine: rx.medicine,
          potency: rx.potency || '',
          quantity: rx.quantity || '1dr',
          doseForm: rx.doseForm || 'pills',
          dosePattern: rx.dosePattern || '1-1-1',
          frequency: rx.frequency || 'Daily',
          duration: rx.duration || '7 days',
          bottles: rx.bottles || 1,
          isCombination: rx.isCombination || false,
          combinationContent: rx.combinationContent || '',
        })),
      visitDate: new Date(),
    };
    
    printPrescriptionToPharmacy(prescriptionData, printerSettings);
  };

  // ===== MATERIA MEDICA SEARCH =====

  const searchMateriaMedica = async (query: string) => {
    setMateriaMedicaQuery(query);
    // TODO: Implement materia medica search
    // This would search against a materia medica database
  };

  // ===== PAST HISTORY =====

  const repeatPastVisit = (visit: Visit) => {
    if (visit.caseText) {
      setCaseText(visit.caseText);
      setSymptoms(visit.caseText.split('\n').filter((s) => s.trim().length > 0));
    }
    if (visit.diagnosis) setDiagnosis(visit.diagnosis);
    if (visit.advice) setAdvice(visit.advice);
    setShowPastVisitsPopup(false);
  };
  
  // Copy prescription from past visit to current prescription
  const copyPrescriptionFromPastVisit = (visitId: string) => {
    const visitPrescriptions = pastVisitPrescriptions[visitId] || [];
    if (visitPrescriptions.length > 0) {
      // Add copied prescriptions below existing ones
      setPrescriptions(prev => [...prev, ...visitPrescriptions.map(rx => ({ ...rx }))]);
    }
    // Close the popup after copying
    setShowPastVisitsPopup(false);
  };
  
  // Load prescriptions for past visits
  const loadPastVisitPrescriptions = (visitId: string) => {
    if (!pastVisitPrescriptions[visitId]) {
      const rxList = doctorPrescriptionDb.getByVisit(visitId) as Array<{
        medicine: string;
        potency?: string;
        quantity: string;
        doseForm?: string;
        dosePattern?: string;
        frequency?: string;
        duration?: string;
        durationDays?: number;
        bottles?: number;
        instructions?: string;
        isCombination?: boolean;
        combinationName?: string;
        combinationContent?: string;
      }>;
      if (rxList && rxList.length > 0) {
        setPastVisitPrescriptions(prev => ({
          ...prev,
          [visitId]: rxList.map(rx => ({
            medicine: rx.medicine,
            potency: rx.potency,
            quantity: rx.quantity,
            doseForm: rx.doseForm,
            dosePattern: rx.dosePattern,
            frequency: rx.frequency,
            duration: rx.duration,
            durationDays: rx.durationDays,
            bottles: rx.bottles,
            instructions: rx.instructions,
            isCombination: rx.isCombination,
            combinationName: rx.combinationName,
            combinationContent: rx.combinationContent,
          }))
        }));
      }
    }
  };
  
  // Open past visits popup
  const openPastVisitsPopup = () => {
    setShowPastVisitsPopup(true);
    // Load prescriptions for all past visits
    pastVisits.forEach(visit => {
      loadPastVisitPrescriptions(visit.id);
    });
  };
  
  // Share past visit via WhatsApp - sends prescription as PDF via connected WhatsApp
  const sharePastVisitWhatsApp = async (visit: Visit) => {
    if (!patient) return;

    try {
      const { generatePrescriptionPdfFromHTML, sendPrescriptionViaWhatsApp } = await import('@/lib/whatsapp-send-document');
      const doctorName = getCurrentUser()?.name || '';
      const visitRx = pastVisitPrescriptions[visit.id] || [];

      const base64 = await generatePrescriptionPdfFromHTML(
        {
          firstName: patient.firstName,
          lastName: patient.lastName,
          registrationNumber: patient.registrationNumber,
          mobileNumber: patient.mobile,
          age: (patient as any).age,
          sex: (patient as any).gender,
        },
        visitRx.filter(rx => rx.medicine.trim()) as any[],
        {
          chiefComplaint: visit.caseText,
          advice: visit.advice,
          visitDate: visit.visitDate instanceof Date ? visit.visitDate : new Date(visit.visitDate),
          nextVisit: visit.nextVisit ? String(visit.nextVisit) : undefined,
        },
        doctorName
      );

      const dateStr = new Date(visit.visitDate).toLocaleDateString('en-GB').replace(/\//g, '-');
      const filename = `Prescription_${patient.firstName}_${patient.lastName}_${dateStr}.pdf`;
      const caption = `Prescription for ${patient.firstName} ${patient.lastName} — ${new Date(visit.visitDate).toLocaleDateString()}`;

      await sendPrescriptionViaWhatsApp(patient.mobile, base64, filename, caption);
      alert('Prescription sent via WhatsApp successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`WhatsApp send failed: ${msg}`);
    }
  };
  
  // Share past visit via Email
  const sharePastVisitEmail = (visit: Visit) => {
    if (!patient) return;
    
    const visitRx = pastVisitPrescriptions[visit.id] || [];
    const prescriptionText = visitRx
      .filter(rx => rx.medicine.trim())
      .map((rx, i) => `${i + 1}. ${rx.medicine} ${rx.potency || ''} - ${rx.dosePattern} for ${rx.duration}`)
      .join('\n');
    
    const subject = encodeURIComponent(`Your Prescription - ${new Date(visit.visitDate).toLocaleDateString()}`);
    const body = encodeURIComponent(`Dear ${patient.firstName} ${patient.lastName},

Please find your prescription below:

Medicines:
${prescriptionText || 'No medicines prescribed'}

${visit.advice ? `Advice: ${visit.advice}` : ''}

Thank you for visiting Dr. Homeopathic Clinic!

Best regards,
Dr. Homeopathic Clinic`);
    
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };
  
  // Generate PDF content for past visit
  const generatePastVisitPDFContent = (visit: Visit) => {
    const visitRx = pastVisitPrescriptions[visit.id] || [];
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Prescription - ${new Date(visit.visitDate).toLocaleDateString()}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
          .patient-info { margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; border-bottom: 1px solid #ccc; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>Dr. Homeopathic Clinic</h1>
        <div class="patient-info">
          <p><strong>Patient:</strong> ${patient?.firstName} ${patient?.lastName}</p>
          <p><strong>Date:</strong> ${new Date(visit.visitDate).toLocaleDateString()}</p>
          <p><strong>Visit #:</strong> ${visit.visitNumber}</p>
        </div>
        ${visit.caseText ? `<div class="section"><div class="section-title">Case Notes</div><p>${visit.caseText}</p></div>` : ''}
        ${visitRx.length > 0 ? `
          <div class="section">
            <div class="section-title">Prescription</div>
            <table>
              <thead>
                <tr><th>Medicine</th><th>Potency</th><th>Dose Form</th><th>Pattern</th><th>Frequency</th><th>Duration</th></tr>
              </thead>
              <tbody>
                ${visitRx.map(rx => `<tr><td>${rx.isCombination ? rx.combinationName + ' (Combo)' : rx.medicine}</td><td>${rx.potency || '-'}</td><td>${rx.doseForm || '-'}</td><td>${rx.dosePattern || '-'}</td><td>${rx.frequency || '-'}</td><td>${rx.duration || '-'}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
        ${visit.advice ? `<div class="section"><div class="section-title">Advice</div><p>${visit.advice}</p></div>` : ''}
        ${visit.nextVisit ? `<div class="section"><p><strong>Next Visit:</strong> ${new Date(visit.nextVisit).toLocaleDateString()}</p></div>` : ''}
      </body>
      </html>
    `;
  };

  // Download past visit as PDF
  const downloadPastVisitPDF = (visit: Visit) => {
    const pdfContent = generatePastVisitPDFContent(visit);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(pdfContent);
      printWindow.document.close();
      // Trigger print dialog which allows saving as PDF
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  // Print past visit
  const printPastVisit = (visit: Visit) => {
    const pdfContent = generatePastVisitPDFContent(visit);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(pdfContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // ===== RENDER =====

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Datalists for autocomplete using prescription settings */}
      <datalist id="potency-list">
        {prescriptionSettings.potency.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="quantity-list">
        {prescriptionSettings.quantity.map((q) => (
          <option key={q} value={q} />
        ))}
      </datalist>
      <datalist id="pattern-list">
        {prescriptionSettings.pattern.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="frequency-list">
        {prescriptionSettings.frequency.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <datalist id="duration-list">
        {prescriptionSettings.duration.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      
      <Sidebar />
      
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} relative`}>
        {showSaveNotice && (
          <div className="fixed top-4 right-4 z-50">
            <div className="px-4 py-2 bg-green-600 text-white rounded shadow">
              Case saved
            </div>
          </div>
        )}
        
        {/* Edit Patient Form - Compact Small Box */}
        {showEditPatientForm && patient && (
          <div className="absolute top-16 left-6 bg-white border border-gray-200 p-2 z-40 shadow-md rounded-lg" style={{ width: '450px' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Edit Patient</span>
              <button onClick={() => setShowEditPatientForm(false)} className="text-gray-400 hover:text-gray-600 p-0 w-5 h-5 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-1.5">
              <input type="text" defaultValue={patient.firstName} id="edit-firstName" placeholder="First Name" className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              <input type="text" defaultValue={patient.lastName} id="edit-lastName" placeholder="Last Name" className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              <input type="text" defaultValue={patient.mobile} id="edit-mobile" placeholder="Mobile" className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
              <div className="flex gap-1">
                <input type="number" defaultValue={patient.age} id="edit-age" placeholder="Age" className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                <select defaultValue={patient.gender || ''} id="edit-gender" className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">Sex</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={() => {
                  try {
                    const firstName = (document.getElementById('edit-firstName') as HTMLInputElement)?.value || patient.firstName;
                    const lastName = (document.getElementById('edit-lastName') as HTMLInputElement)?.value || patient.lastName;
                    const mobileNumber = (document.getElementById('edit-mobile') as HTMLInputElement)?.value || patient.mobile;
                    const age = parseInt((document.getElementById('edit-age') as HTMLInputElement)?.value || '0') || (patient.age as number) || 0;
                    const gender = (document.getElementById('edit-gender') as HTMLSelectElement)?.value || patient.gender;
                    
                    const updatedPatient = {
                      ...patient,
                      firstName,
                      lastName,
                      fullName: `${firstName} ${lastName}`,
                      mobileNumber,
                      age,
                      gender,
                      updatedAt: new Date(),
                    };
                    
                    patientDb.update(patient.id, updatedPatient);
                    setPatient(updatedPatient);
                    setShowEditPatientForm(false);
                    alert('Updated!');
                  } catch (error) {
                    console.error('Error updating patient:', error);
                    alert('Failed to update.');
                  }
                }}
                className="flex-1 bg-blue-600 text-white text-sm px-2 py-1.5 rounded hover:bg-blue-700 font-medium"
              >
                Save
              </button>
              <button onClick={() => setShowEditPatientForm(false)} className="flex-1 bg-gray-200 text-gray-800 text-sm px-2 py-1.5 rounded hover:bg-gray-300 font-medium">
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {/* Doctor Panel */}
        <>
            {/* Header with Patient Context */}
            <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                {/* Left Section - Title and Patient Info */}
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <h1 className="text-lg font-bold text-gray-800 whitespace-nowrap flex-shrink-0">Doctor Panel</h1>
                  
                  {/* Patient Info Card or Placeholder */}
                  {patient ? (
                    <div className="relative patient-menu-container flex-shrink-0">
                      <div className="flex items-center gap-3 bg-blue-50 px-3 py-2 rounded-lg h-16">
                        <div className="flex-1 cursor-pointer min-w-0" onClick={() => setShowPatientMenu(!showPatientMenu)}>
                          <p className="text-sm font-medium text-blue-800 truncate">
                            {patient.firstName} {patient.lastName}
                            <svg className="inline-block w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </p>
                          <p className="text-xs text-blue-600 truncate">
                            Reg: {patient.registrationNumber} | {patient.age ? `${patient.age}yrs` : ''} | {patient.gender}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-500">Mobile</p>
                          <p className="text-sm font-medium">{patient.mobile}</p>
                        </div>
                        <button
                          onClick={() => {
                            // Clear localStorage when closing patient
                            if (typeof window !== 'undefined') {
                              localStorage.removeItem('doctorPanelCurrentPatient');
                              localStorage.removeItem('doctorPanelCalledQueueItemId');
                            }
                            setPatient(null);
                            router.push('/doctor-panel');
                          }}
                          className="ml-1 p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Dropdown Menu */}
                      {showPatientMenu && (
                        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                          <button
                            onClick={() => {
                              setShowPatientMenu(false);
                              setShowEditPatientForm(true);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-t-lg"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Patient Details
                          </button>
                          <button
                            onClick={() => {
                              setShowPatientMenu(false);
                              router.push(`/patients/${patient.id}`);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-b-lg"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            View Patient Profile
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-blue-50 px-3 py-2 rounded-lg h-16 flex-shrink-0">
                      <div>
                        <p className="text-sm font-medium text-blue-800">No patient selected</p>
                        <p className="text-xs text-blue-600">Use search to select a patient</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Visit Stats */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
                    <span>Visits: {pastVisits.length + 1}</span>
                    {pastVisits[0] && (
                      <span>
                        Last: {new Date(pastVisits[0].visitDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle Section - Search */}
                <div className="relative w-72 flex-shrink-0">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search by name, reg, mobile..."
                    value={searchQuery}
                    onChange={(e) => {
                      setActiveSearchIndex(-1);
                      handleSearchChange(e);
                    }}
                    onKeyDown={(e) => {
                      if (!showSearchResults) return;
                      const max = searchResults.length - 1;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = Math.min(activeSearchIndex + 1, max);
                        setActiveSearchIndex(next);
                        const el = searchItemRefs.current[next];
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = Math.max(activeSearchIndex - 1, 0);
                        setActiveSearchIndex(prev);
                        const el = searchItemRefs.current[prev];
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const indexToUse = activeSearchIndex >= 0 ? activeSearchIndex : 0;
                        const chosen = searchResults[indexToUse];
                        if (chosen) {
                          handleSelectPatient(chosen);
                          setActiveSearchIndex(-1);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 pl-10 text-sm"
                  />
                  <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                  {showSearchResults && (
                    <div ref={searchListRef} className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50">
                      {searchResults.length > 0 ? (
                        searchResults.map((p, index) => (
                          <button
                            key={p.id}
                            ref={(el) => { searchItemRefs.current[index] = el; }}
                            onClick={() => handleSelectPatient(p)}
                            className={`w-full text-left px-4 py-2 border-b border-gray-100 last:border-b-0 ${
                              activeSearchIndex === index ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-gray-900">{p.firstName} {p.lastName}</div>
                            <div className="text-sm text-gray-500">
                              Reg: {p.registrationNumber} • {p.mobile} • {p.age ? `${p.age}yrs` : ''} • {p.gender}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-gray-500 text-sm">No patients found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Section - Time and Buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <TimeDisplay />
                  <button
                    onClick={() => setShowAppointmentsBoard(true)}
                    className="px-3 py-1.5 text-xs bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors whitespace-nowrap"
                    title="View Today's Appointments"
                  >
                    Appointments ({todayAppointments.length})
                  </button>
                  <button
                    onClick={openPastVisitsPopup}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 whitespace-nowrap"
                  >
                    Past Visits ({pastVisits.length})
                  </button>
                  <button
                    onClick={() => setShowPharmacyMini(true)}
                    className="px-3 py-1.5 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors whitespace-nowrap"
                    title="Open Pharmacy Queue Window"
                  >
                    Pharmacy Queue ({pharmacyLiveItems.length})
                  </button>
                </div>
              </div>
            </header>

            <main className="flex gap-3 p-3">
              {/* Left Column - Case Taking */}
              <div className="flex-1 space-y-3">
                {/* Case Taking Section */}
                <section className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {symptoms.map((sym, index) => (
                          <div key={`${index}-${sym}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm border border-gray-300 bg-gray-50">
                            {editingSymptomIndex === index ? (
                              <input
                                autoFocus
                                type="text"
                                defaultValue={sym}
                                onBlur={(e) => commitEditSymptom(index, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitEditSymptom(index, (e.target as HTMLInputElement).value);
                                  }
                                }}
                                className="px-2 py-1 border border-gray-200 rounded text-sm"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditSymptom(index)}
                                className="text-sm text-gray-800"
                                title="Edit symptom"
                              >
                                {sym}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeSymptom(index)}
                              className="text-gray-400 hover:text-red-600"
                              title="Remove symptom"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Case Taking:</label>
                        <div className="flex-1 relative">
                          <Input
                            value={symptomInput}
                            onChange={(e) => {
                              setSymptomInput(e.target.value);
                              setShowSymptomSuggestions(true);
                              setSelectedSuggestionIndex(-1);
                            }}
                            onKeyDown={handleSymptomKeyDown}
                            onFocus={() => symptomInput && setShowSymptomSuggestions(true)}
                            placeholder="Type symptom and press Enter"
                            className="flex-1 px-2 py-1 text-sm"
                          />
                          
                          {/* Symptom Suggestions Dropdown */}
                          {showSymptomSuggestions && getFilteredSuggestions().length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                              {getFilteredSuggestions().map((suggestion, index) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  onClick={() => {
                                    setSymptomInput(suggestion);
                                    setShowSymptomSuggestions(false);
                                    setSelectedSuggestionIndex(-1);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                    index === selectedSuggestionIndex
                                      ? 'bg-indigo-100 text-indigo-900'
                                      : 'hover:bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button variant="secondary" onClick={handleAddSymptom} size="sm">Add</Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          Tip: Type to see suggestions from history. Use ↑↓ arrows to navigate, Enter to select. Click a pill to edit; use × to delete.
                        </p>
                        <button
                          onClick={() => setIsSystemAssist(!isSystemAssist)}
                          className={`px-2 py-0.5 text-xs rounded transition-colors whitespace-nowrap ${
                            isSystemAssist 
                              ? 'bg-amber-100 text-amber-700 border border-amber-300' 
                              : 'bg-gray-100 text-gray-600 border border-gray-300'
                          }`}
                        >
                          System Assist {isSystemAssist ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      {isSystemAssist && (
                        <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded">
                          <p className="text-xs text-amber-700 font-medium mb-1">💡 Suggestions</p>
                          <ul className="text-xs text-amber-600 space-y-0.5">
                            <li>• Consider asking about timing (morning/evening)</li>
                            <li>• Explore aggravating/ameliorating factors</li>
                            <li>• Ask about appetite, thirst, sleep</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Prescription Table */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-800">Prescription</h2>
                    <div className="flex items-center gap-1">
                      {pastVisits.length > 0 && (
                        <button
                          onClick={openPastVisitsPopup}
                          className="px-3 py-1 text-sm bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-1"
                          title="Load prescription from past visit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Load Rx
                        </button>
                      )}
                      <button
                        onClick={addEmptyPrescriptionRow}
                        className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                      >
                        + Add Medicine
                      </button>
                    </div>
                  </div>
                  
                  {/* Smart Parsing Input */}
                  <div className="px-4 pt-2 pb-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 relative">
                        <input
                          ref={smartParseInputRef}
                          type="text"
                          value={smartParseInput}
                          autoFocus
                          onFocus={() => setIsSmartParseActive(true)}
                          onBlur={() => setIsSmartParseActive(false)}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSmartParseInput(val);
                                  const q = val.trim().toLowerCase();
                                  if (q.length > 0) {
                                    const matches = smartParseHistory
                                      .filter(line => line.toLowerCase().includes(q))
                                      .slice(0, 10);
                                    setSmartParseSuggestions(matches);
                                    setShowSmartParseSuggestions(matches.length > 0);
                                    setSmartParseSelectedIndex(-1);
                                  } else {
                                    setSmartParseSuggestions([]);
                                    setShowSmartParseSuggestions(false);
                                    setSmartParseSelectedIndex(-1);
                                  }
                                }}
                          onKeyDown={handleSmartParseInputKeyDown}
                          placeholder={aiParsingEnabled && aiApiKey ? "AI Smart Parse: Type prescription and press Enter" : "Smart Parse: Type \"Arnica 200 2dr 4 pills TDS for 7 days\" and press Enter"}
                          className="w-full px-4 py-2.5 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-amber-50 text-sm"
                          disabled={isAiParsing}
                        />
                              {showSmartParseSuggestions && smartParseSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-[60]">
                                  {smartParseSuggestions.map((s, i) => (
                                    <button
                                      key={`${i}-${s}`}
                                      onClick={() => {
                                        setSmartParseInput(s.trim());
                                        setShowSmartParseSuggestions(false);
                                        setSmartParseSuggestions([]);
                                        setSmartParseSelectedIndex(-1);
                                        setTimeout(() => {
                                          smartParseInputRef.current?.focus();
                                        }, 0);
                                      }}
                                      className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-50 ${i === smartParseSelectedIndex ? 'bg-blue-50 text-blue-700' : ''}`}
                                      title={s}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-amber-600">
                          {isAiParsing ? (
                            <span className="flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              <span>AI Parsing...</span>
                            </span>
                          ) : (
                            <>
                              {aiParsingEnabled && aiApiKey && (
                                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs mr-1">AI</span>
                              )}
                              <span className="font-medium">Press Enter</span>
                              <kbd className="px-1.5 py-0.5 bg-amber-100 rounded text-amber-700 font-mono">↵</kbd>
                            </>
                          )}
                        </div>
                      </div>
                      {/* AI Toggle Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const newEnabled = !aiParsingEnabled;
                          setAiParsingEnabled(newEnabled);
                          // Save to localStorage
                          const savedSettings = localStorage.getItem('aiParsingSettings');
                          const settings = savedSettings ? JSON.parse(savedSettings) : {};
                          settings.enabled = newEnabled;
                          localStorage.setItem('aiParsingSettings', JSON.stringify(settings));
                        }}
                        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                          aiParsingEnabled && aiApiKey ? "bg-green-600" : "bg-gray-300"
                        }`}
                        title={aiApiKey ? (aiParsingEnabled ? "AI Parsing ON - Click to disable" : "AI Parsing OFF - Click to enable") : "Set up AI API key in Settings first"}
                      >
                        <span
                          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                            aiParsingEnabled && aiApiKey ? "translate-x-7" : "translate-x-1"
                          }`}
                        />
                        <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${
                          aiParsingEnabled && aiApiKey ? "text-white" : "text-gray-500"
                        }`}>
                          AI
                        </span>
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {aiParsingEnabled && aiApiKey 
                        ? "AI-powered parsing enabled. Try: \"Ars alb 1M 1/2oz liquid 6-6-6 4 weeks\""
                        : aiApiKey 
                          ? "AI parsing disabled. Toggle ON to use AI, or use format: Medicine Potency Quantity DoseForm Pattern Duration"
                          : "Format: Medicine Potency Quantity DoseForm Pattern Duration (e.g., \"Belladonna 200 1dr pills 1-1-1 7 days\") - Add API key in Settings for AI parsing"
                      }
                    </p>
                  </div>
                  
                  <div className="p-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                          <th className="pb-2 font-medium">Medicine</th>
                          <th className="pb-2 font-medium w-16">Potency</th>
                          <th className="pb-2 font-medium w-20">Quantity</th>
                          <th className="pb-2 font-medium w-20">Dose Form</th>
                          <th className="pb-2 font-medium w-20">Pattern</th>
                          <th className="pb-2 font-medium w-20">Frequency</th>
                          <th className="pb-2 font-medium w-20">Duration</th>
                          <th className="pb-2 font-medium w-12">Bottles</th>
                          <th className="pb-2 font-medium w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {prescriptions.map((rx, index) => (
                          <tr key={index} className="border-b border-gray-50">
                            <td className="py-1 relative">
                              <div className="relative flex items-center gap-1">
                                {/* + button for combination */}
                                <button
                                  onClick={() => handleOpenCombination(index)}
                                  className={`shrink-0 w-7 h-7 flex items-center justify-center rounded text-sm font-bold ${
                                    rx.isCombination 
                                      ? 'bg-purple-500 text-white' 
                                      : 'bg-gray-100 text-gray-500 hover:bg-purple-100 hover:text-purple-600'
                                  }`}
                                  title="Add Combination"
                                >
                                  +
                                </button>
                                <div className="flex-1 relative">
                                  <input
                                    type="text"
                                    value={rx.medicine}
                                    onChange={(e) => handleMedicineSearchChange(index, e.target.value)}
                                    onKeyDown={(e) => handleMedicineKeyDown(e, index, prescriptions.length)}
                                    onFocus={() => {
                                      setFocusedMedicineIndex(index);
                                      // Show suggestions when field is focused
                                      if (rx.medicine.trim().length > 0) {
                                        const suggestions = getAllMedicinesForAutocomplete(rx.medicine);
                                        setMedicineSuggestions(suggestions);
                                      } else {
                                        // Show all medicines when field is empty (including database combinations with content)
                                        const localStorageCombos = getCombinationsWithContent();
                                        const dbComboMap = new Map(dbCombinations.map(c => [c.name.toLowerCase(), c.content]));
                                        const localStorageComboMap = new Map(localStorageCombos.map(c => [c.name.toLowerCase(), c.content]));
                                        
                                        // Merge all combination names (database takes priority for content)
                                        const allComboNames = [...new Set([
                                          ...dbCombinations.map(c => c.name),
                                          ...localStorageCombos.map(c => c.name)
                                        ])]; 
                                        
                                        const allMeds: {name: string; content?: string}[] = [
                                          ...getCustomMedicines().map(m => ({ name: m })),
                                          ...allComboNames.map(c => ({ 
                                            name: c, 
                                            content: dbComboMap.get(c.toLowerCase()) || localStorageComboMap.get(c.toLowerCase()) || '' 
                                          })),
                                          ...commonMedicines.slice(0, 5).map(m => ({ name: m }))
                                        ].slice(0, 10);
                                        setMedicineSuggestions(allMeds);
                                      }
                                      setShowMedicineSuggestions(true);
                                      setSelectedMedicineSuggestionIndex(-1);
                                    }}
                                    onBlur={() => {
                                      // Delay hiding to allow click on suggestion
                                      setTimeout(() => {
                                        setShowMedicineSuggestions(false);
                                        setFocusedMedicineIndex(null);
                                      }, 200);
                                    }}
                                    placeholder="Medicine name"
                                    className={`w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 ${
                                      rx.isCombination ? 'border-purple-300 bg-purple-50' : 'border-gray-200'
                                    }`}
                                    autoComplete="off"
                                  />
                                  {/* Autocomplete Dropdown - only show for focused input */}
                                  {showMedicineSuggestions && focusedMedicineIndex === index && medicineSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-[100]">
                                      {medicineSuggestions.map((suggestion, i) => (
                                        <button
                                          key={i}
                                          onClick={() => selectMedicine(index, suggestion)}
                                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${
                                            i === selectedMedicineSuggestionIndex ? 'bg-blue-50 text-blue-700' : ''
                                          }`}
                                        >
                                          <div className="font-medium">{suggestion.name}</div>
                                          {suggestion.content && (
                                            <div className="text-xs text-gray-500 mt-0.5">{suggestion.content}</div>
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {/* Combination details shown below in same field */}
                                  {rx.isCombination && rx.combinationContent && (
                                    <div className="mt-1 pt-1 border-t border-purple-200 text-xs text-gray-500">
                                      {rx.combinationContent}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Inline combination editor */}
                              {editingCombinationIndex === index && (
                                <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200 space-y-2">
                                  <input
                                    type="text"
                                    value={combinationName}
                                    onChange={(e) => setCombinationName(e.target.value)}
                                    placeholder="Combination Name (e.g., Bioplasgen No. 10)"
                                    className="w-full px-2 py-1 text-sm border border-purple-200 rounded focus:ring-2 focus:ring-purple-500"
                                  />
                                  <textarea
                                    value={combinationContent}
                                    onChange={(e) => setCombinationContent(e.target.value)}
                                    placeholder="List the medicines and potencies..."
                                    className="w-full px-2 py-1 text-sm border border-purple-200 rounded focus:ring-2 focus:ring-purple-500 resize-none"
                                    rows={2}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={saveCombination}
                                      className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelCombination}
                                      className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="py-1">
                              <input
                                type="text"
                                list="potency-list"
                                value={rx.potency || ''}
                                onChange={(e) => updatePrescriptionRow(index, 'potency', e.target.value)}
                                onKeyDown={(e) => handlePotencyKeyDown(e, index, prescriptions.length)}
                                placeholder="200"
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1">
                              <input
                                type="text"
                                list="quantity-list"
                                value={rx.quantity}
                                onChange={(e) => updatePrescriptionRow(index, 'quantity', e.target.value)}
                                onKeyDown={handleGenericEnterMove}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1">
                              <select
                                value={rx.doseForm || 'Pills'}
                                onChange={(e) => updatePrescriptionRow(index, 'doseForm', e.target.value)}
                                onKeyDown={handleGenericEnterMove}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              >
                                {prescriptionSettings.doseForm.map((form) => (
                                  <option key={form} value={form.toLowerCase()}>{form}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1">
                              <input
                                type="text"
                                list="pattern-list"
                                value={rx.dosePattern}
                                onChange={(e) => updatePrescriptionRow(index, 'dosePattern', e.target.value)}
                                onKeyDown={handleGenericEnterMove}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1">
                              <input
                                type="text"
                                list="frequency-list"
                                value={rx.frequency}
                                onChange={(e) => updatePrescriptionRow(index, 'frequency', e.target.value)}
                                onKeyDown={handleGenericEnterMove}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1">
                              <input
                                type="text"
                                list="duration-list"
                                value={rx.duration || ''}
                                onChange={(e) => updatePrescriptionRow(index, 'duration', e.target.value)}
                                placeholder="7 days"
                                onKeyDown={handleGenericEnterMove}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1">
                              <input
                                type="number"
                                value={rx.bottles ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    updatePrescriptionRow(index, 'bottles', undefined as unknown as number);
                                  } else {
                                    const num = parseInt(val);
                                    updatePrescriptionRow(index, 'bottles', isNaN(num) ? (undefined as unknown as number) : num);
                                  }
                                }}
                                onKeyDown={(e) => handleBottlesKeyDown(e, index, prescriptions.length)}
                                min="1"
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-1">
                              <div className="flex gap-0.5">
                                <button
                                  onClick={() => movePrescriptionRow(index, 'up')}
                                  disabled={index === 0}
                                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => movePrescriptionRow(index, 'down')}
                                  disabled={index === prescriptions.length - 1}
                                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => removePrescriptionRow(index)}
                                  className="p-1 text-red-400 hover:text-red-600"
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {prescriptions.length === 0 && (
                      <div className="text-center py-8 text-gray-400">
                        No prescriptions added yet. Click &quot;+ Add Medicine&quot; to start.
                      </div>
                    )}
                  </div>
                </section>

                {/* Next Visit Section - Compact inline layout */}
                <section className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <div className="p-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            Next Visit Date <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={nextVisit}
                            onChange={(e) => handleNextVisitDateChange(e.target.value)}
                            required
                            className="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            Or Days <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            value={nextVisitDays}
                            onChange={(e) => handleNextVisitDaysChange(e.target.value)}
                            placeholder="7"
                            maxLength={4}
                            className="px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 w-16"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Next Visit:</label>
                          {nextVisit ? (
                            <div className="text-sm text-gray-600 font-medium px-2 py-1 bg-gray-50 rounded border border-gray-200 whitespace-nowrap">
                              📅 {new Date(nextVisit).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400 px-2 py-1 bg-gray-50 rounded border border-gray-200">-</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Upload documents"
                          onClick={() => document.getElementById('file-upload-input')?.click()}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </button>
                        <input
                          id="file-upload-input"
                          type="file"
                          multiple
                          accept="image/*,.pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        {uploadedFiles.length > 0 && (
                          <button
                            type="button"
                            title="View uploaded files"
                            onClick={() => setShowUploadedFiles(!showUploadedFiles)}
                            className="relative p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="absolute top-0 right-0 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{uploadedFiles.length}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* File Viewer Popup */}
                {showUploadedFiles && uploadedFiles.length > 0 && (
                  <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between p-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Uploaded Files ({uploadedFiles.length})</h3>
                        <button
                          type="button"
                          onClick={() => setShowUploadedFiles(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Grid Content */}
                      <div className="flex-1 overflow-auto p-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                          {uploadedFiles.map((file, index) => (
                            <div key={index} className="flex flex-col">
                              {editingGridFileIndex === index ? (
                                // Edit mode
                                <div className="border-2 border-blue-400 rounded-lg p-3 bg-blue-50 flex flex-col gap-2">
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                    placeholder="File name"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <textarea
                                    value={editingRemarks}
                                    onChange={(e) => setEditingRemarks(e.target.value)}
                                    className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500 resize-none h-12"
                                    placeholder="Add remarks..."
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSaveFileEdit(index);
                                      }}
                                      className="flex-1 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelFileEdit();
                                      }}
                                      className="flex-1 px-2 py-1 bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs rounded transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                // View mode
                                <div
                                  className="relative group cursor-pointer"
                                  onClick={() => setViewerFile(file)}
                                >
                                  <div className="aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center hover:border-blue-400 hover:shadow-md transition-all">
                                    {file.type.startsWith('image/') ? (
                                      <img
                                        src={file.data}
                                        alt={file.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex flex-col items-center justify-center w-full h-full bg-red-50">
                                        <svg className="w-8 h-8 text-red-500 mb-2" fill="currentColor" viewBox="0 0 20 20">
                                          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                          <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                                        </svg>
                                        <span className="text-xs text-red-600 font-medium text-center px-1">PDF</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 rounded-lg transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  </div>
                                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRenameFile(index);
                                      }}
                                      className="p-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                                      title="Edit file"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveFile(index);
                                      }}
                                      className="p-1 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                                      title="Remove file"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                              <p className="text-xs text-gray-600 mt-2 truncate text-center font-medium" title={file.name}>
                                {file.name}
                              </p>
                              {file.remarks && (
                                <p className="text-xs text-gray-500 mt-1 text-center line-clamp-2" title={file.remarks}>
                                  {file.remarks}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* File Viewer Popup - Individual File View */}
                {viewerFile && (
                  <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between p-4 border-b border-gray-200">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 truncate">{viewerFile.name}</h3>
                          {viewerFile.remarks && (
                            <p className="text-sm text-gray-600 mt-1">{viewerFile.remarks}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setViewerFile(null);
                            setViewerZoom(100);
                          }}
                          className="text-gray-400 hover:text-gray-600 ml-4"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* Zoom Controls */}
                      <div className="flex items-center justify-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
                        <button
                          type="button"
                          onClick={() => setViewerZoom(Math.max(50, viewerZoom - 10))}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                          title="Zoom out"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                          </svg>
                        </button>
                        <span className="text-sm font-medium text-gray-700 w-12 text-center">{viewerZoom}%</span>
                        <button
                          type="button"
                          onClick={() => setViewerZoom(Math.min(300, viewerZoom + 10))}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                          title="Zoom in"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewerZoom(100)}
                          className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                          title="Reset zoom"
                        >
                          Reset
                        </button>
                        <div className="w-px h-6 bg-gray-300"></div>
                        <a
                          href={viewerFile.data}
                          download={viewerFile.name}
                          className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          title="Download file"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      </div>

                      {/* Content */}
                      <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-900">
                        {viewerFile.type.startsWith('image/') ? (
                          <img
                            src={viewerFile.data}
                            alt={viewerFile.name}
                            style={{ transform: `scale(${viewerZoom / 100})`, transformOrigin: 'center' }}
                            className="transition-transform"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-white">
                            <svg className="w-16 h-16 text-red-500 mb-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                            </svg>
                            <p className="text-lg font-medium mb-2">PDF File</p>
                            <p className="text-sm text-gray-400 mb-4">{viewerFile.name}</p>
                            <a
                              href={viewerFile.data}
                              download={viewerFile.name}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            >
                              Download PDF
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Notes - Collapsible */}
                <section className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowAdditionalNotes(!showAdditionalNotes)}
                    className="w-full px-4 py-2 flex items-center justify-between border-b border-gray-100"
                  >
                    <h2 className="text-base font-semibold text-gray-800">Additional Notes</h2>
                    <svg 
                      className={`w-5 h-5 text-gray-500 transition-transform ${showAdditionalNotes ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showAdditionalNotes && (
                    <div className="p-3 space-y-2">
                      {/* Vital Signs Row - BP, Pulse, Temp, Weight */}
                      <div className="flex items-end gap-2">
                        <div className="flex-shrink-0">
                          <label className="block text-xs font-medium text-gray-700 mb-1">BP</label>
                          <input
                            type="text"
                            value={bp}
                            onChange={(e) => setBp(e.target.value)}
                            placeholder="120/80"
                            maxLength={7}
                            className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex-shrink-0">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Pulse</label>
                          <input
                            type="text"
                            value={pulse}
                            onChange={(e) => setPulse(e.target.value.slice(0, 3))}
                            placeholder="72"
                            maxLength={3}
                            className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex-shrink-0">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Temp °F</label>
                          <input
                            type="text"
                            value={tempF}
                            onChange={(e) => setTempF(e.target.value.slice(0, 5))}
                            placeholder="98.6"
                            maxLength={5}
                            className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex-shrink-0">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Weight (kg)</label>
                          <input
                            type="text"
                            value={weightKg}
                            onChange={(e) => setWeightKg(e.target.value.slice(0, 4))}
                            placeholder="65"
                            maxLength={4}
                            className="w-20 px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Diagnosis and Prognosis Row */}
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Diagnosis</label>
                          <input
                            type="text"
                            value={diagnosis}
                            onChange={(e) => setDiagnosis(e.target.value)}
                            placeholder="Enter diagnosis"
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Prognosis</label>
                          <select
                            value={prognosis}
                            onChange={(e) => setPrognosis(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select</option>
                            <option value="excellent">Excellent</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="guarded">Guarded</option>
                            <option value="poor">Poor</option>
                          </select>
                        </div>
                      </div>

                      {/* Tests Required Row */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tests Required</label>
                        <input
                          type="text"
                          value={testsRequired}
                          onChange={(e) => setTestsRequired(e.target.value)}
                          placeholder="Enter tests if any"
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Advice Row */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Advice</label>
                        <textarea
                          value={advice}
                          onChange={(e) => setAdvice(e.target.value)}
                          placeholder="Enter advice for the patient"
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                        />
                      </div>

                      {/* Remarks to Frontdesk Row */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Remarks to Frontdesk</label>
                        <textarea
                          value={remarksToFrontdesk}
                          onChange={(e) => setRemarksToFrontdesk(e.target.value)}
                          placeholder="Any remarks for frontdesk"
                          className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </section>
              </div>

              {/* Right Column - Fee & Actions */}
              <div className="w-80 space-y-6">
                {/* Fee Section */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-800">Fee Details</h2>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    {/* Last Fee Paid Info - Always show if there's fee history */}
                    {lastFeeInfo && (
                      <div className={`rounded-lg p-3 mb-4 ${
                        lastFeeInfo.status === 'pending' ? 'bg-amber-50' : 'bg-blue-50'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <svg className={`w-4 h-4 ${
                            lastFeeInfo.status === 'pending' ? 'text-amber-600' : 'text-blue-600'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {lastFeeInfo.status === 'pending' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                          </svg>
                          <span className={`text-sm font-medium ${
                            lastFeeInfo.status === 'pending' ? 'text-amber-800' : 'text-blue-800'
                          }`}>
                            {lastFeeInfo.status === 'pending' ? 'Last Fee (Due)' : 'Last Fee Paid'}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className={
                            lastFeeInfo.status === 'pending' ? 'text-amber-700' : 'text-blue-700'
                          }>₹{lastFeeInfo.amount} ({lastFeeInfo.feeType})</span>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            lastFeeInfo.status === 'pending' 
                              ? 'bg-amber-200 text-amber-800' 
                              : 'bg-blue-200 text-blue-800'
                          }`}>
                            {lastFeeInfo.status === 'pending' ? 'Due' : 
                             lastFeeInfo.daysAgo === 0 ? 'Today' : 
                             lastFeeInfo.daysAgo === 1 ? 'Yesterday' : 
                             `${lastFeeInfo.daysAgo} days ago`}
                          </span>
                        </div>
                        <div className={`text-xs mt-1 ${
                          lastFeeInfo.status === 'pending' ? 'text-amber-500' : 'text-blue-500'
                        }`}>{lastFeeInfo.date}</div>
                      </div>
                    )}
                    
                    {/* Current Appointment Fee - Show for both paid and due status */}
                    {currentAppointmentFee && (
                      <div className={`rounded-lg p-3 mb-4 ${
                        currentAppointmentFee.feeStatus === 'paid' ? 'bg-green-50' : 
                        currentAppointmentFee.feeStatus === 'exempt' ? 'bg-purple-50' :
                        'bg-amber-50'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <svg className={`w-4 h-4 ${
                            currentAppointmentFee.feeStatus === 'paid' ? 'text-green-600' : 
                            currentAppointmentFee.feeStatus === 'exempt' ? 'text-purple-600' :
                            'text-amber-600'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {currentAppointmentFee.feeStatus === 'paid' ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                          </svg>
                          <span className={`text-sm font-medium ${
                            currentAppointmentFee.feeStatus === 'paid' ? 'text-green-800' : 
                            currentAppointmentFee.feeStatus === 'exempt' ? 'text-purple-800' :
                            'text-amber-800'
                          }`}>Appointment Fee</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className={
                            currentAppointmentFee.feeStatus === 'paid' ? 'text-green-700' : 
                            currentAppointmentFee.feeStatus === 'exempt' ? 'text-purple-700' :
                            'text-amber-700'
                          }>₹{currentAppointmentFee.feeAmount} ({currentAppointmentFee.feeType})</span>
                          <span className={`px-2 py-0.5 text-xs rounded ${
                            currentAppointmentFee.feeStatus === 'paid' ? 'bg-green-200 text-green-800' : 
                            currentAppointmentFee.feeStatus === 'exempt' ? 'bg-purple-200 text-purple-800' :
                            'bg-amber-200 text-amber-800'
                          }`}>
                            {currentAppointmentFee.feeStatus === 'pending' ? 'Due' : 
                             currentAppointmentFee.feeStatus.charAt(0).toUpperCase() + currentAppointmentFee.feeStatus.slice(1)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Collapsible Fee Form */}
                    {currentAppointmentFee && (
                      <div className="border border-gray-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setShowFeeForm(!showFeeForm)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Fee Details
                          </span>
                          <svg 
                            className={`w-4 h-4 transition-transform ${showFeeForm ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {showFeeForm && (
                          <div className="p-3 border-t border-gray-200 space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Amount (₹)</label>
                              <input
                                type="number"
                                value={feeAmount}
                                onChange={(e) => setFeeAmount(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                              <select
                                value={feeTypeId}
                                onChange={(e) => {
                                  const selectedFeeTypeId = e.target.value;
                                  const selectedFee = feeTypes.find(f => f.id === selectedFeeTypeId);
                                  if (selectedFee) {
                                    setFeeTypeId(selectedFeeTypeId);
                                    setFeeType(selectedFee.name);
                                    setFeeAmount(String(selectedFee.amount || ''));
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Select Fee Type</option>
                                {feeTypes.map((fee) => (
                                  <option key={fee.id} value={fee.id}>
                                    {fee.name} - ₹{fee.amount}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                              <select
                                value={paymentStatus}
                                onChange={(e) => setPaymentStatus(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="exempt">Exempt</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label>
                              <input
                                type="number"
                                value={discountPercent}
                                onChange={(e) => setDiscountPercent(e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Reason</label>
                              <textarea
                                value={discountReason}
                                onChange={(e) => setDiscountReason(e.target.value)}
                                placeholder="Reason for discount"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={2}
                              />
                            </div>
                            
                            {/* Save Fee Button */}
                            <div className="pt-2">
                              <Button
                                onClick={handleSaveFee}
                                variant="primary"
                                className="w-full bg-blue-600 hover:bg-blue-700"
                              >
                                Save Fee Changes
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Show fee form in collapsible dropdown if no appointment fee */}
                    {!currentAppointmentFee && (
                      <div className="border border-gray-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setShowFeeForm(!showFeeForm)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Add Fee Details
                          </span>
                          <svg 
                            className={`w-4 h-4 transition-transform ${showFeeForm ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {showFeeForm && (
                          <div className="p-3 border-t border-gray-200 space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Amount (₹)</label>
                              <input
                                type="number"
                                value={feeAmount}
                                onChange={(e) => setFeeAmount(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                              <select
                                value={feeTypeId}
                                onChange={(e) => {
                                  const selectedFeeTypeId = e.target.value;
                                  const selectedFee = feeTypes.find(f => f.id === selectedFeeTypeId);
                                  if (selectedFee) {
                                    setFeeTypeId(selectedFeeTypeId);
                                    setFeeType(selectedFee.name);
                                    setFeeAmount(String(selectedFee.amount || ''));
                                  }
                                }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Select Fee Type</option>
                                {feeTypes.map((fee) => (
                                  <option key={fee.id} value={fee.id}>
                                    {fee.name} - ₹{fee.amount}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                              <select
                                value={paymentStatus}
                                onChange={(e) => setPaymentStatus(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="exempt">Exempt</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label>
                              <input
                                type="number"
                                value={discountPercent}
                                onChange={(e) => setDiscountPercent(e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Reason</label>
                              <textarea
                                value={discountReason}
                                onChange={(e) => setDiscountReason(e.target.value)}
                                placeholder="Reason for discount"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={2}
                              />
                            </div>
                            
                            {/* Save Fee Button */}
                            <div className="pt-2">
                              <Button
                                onClick={handleSaveFee}
                                variant="primary"
                                className="w-full bg-blue-600 hover:bg-blue-700"
                              >
                                Save Fee Details
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                {/* Action Buttons */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <div className="p-6 space-y-3">
                    <Button
                      onClick={() => setShowPrescriptionPreview(true)}
                      variant="secondary"
                      className="w-full"
                    >
                      Preview Prescription
                    </Button>
                    
                    <Button
                      onClick={handleEndConsultation}
                      variant="primary"
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      End Consultation
                    </Button>
                    
                    <Button
                      onClick={handleSaveConsultation}
                      variant="secondary"
                      className="w-full"
                    >
                      Save
                    </Button>
                  </div>
                </section>

                {/* Past Visits - Moved to popup */}
              </div>
            </main>
        </>
      </div>

      {/* Past Visits Popup Modal */}
      {showPastVisitsPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">Past Visits</h2>
              <button
                onClick={() => setShowPastVisitsPopup(false)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {pastVisits.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No past visits found
                </div>
              ) : (
                // Sort past visits by date (newest first)
                [...pastVisits].sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()).map((visit) => {
                  const visitRx = pastVisitPrescriptions[visit.id] || [];
                  return (
                    <div key={visit.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Visit Header */}
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {new Date(visit.visitDate).toLocaleDateString('en-IN', { 
                                weekday: 'long', 
                                day: 'numeric', 
                                month: 'short', 
                                year: 'numeric' 
                              })}
                            </p>
                            {(visit as any).isSelfRepeat && (
                              <span className="px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                                Self Repeat by P/T
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">Visit #{visit.visitNumber}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => copyPrescriptionFromPastVisit(visit.id)}
                            className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-1"
                            title="Copy prescription to current"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy Rx
                          </button>
                          <button
                            onClick={() => downloadPastVisitPDF(visit)}
                            className="px-3 py-1.5 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 flex items-center gap-1"
                            title="Download as PDF"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            PDF
                          </button>
                          <button
                            onClick={() => printPastVisit(visit)}
                            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                            title="Print"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print
                          </button>
                          <button
                            onClick={() => sharePastVisitWhatsApp(visit)}
                            className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
                            title="Share via WhatsApp"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            WhatsApp
                          </button>
                          <button
                            onClick={() => sharePastVisitEmail(visit)}
                            className="px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex items-center gap-1"
                            title="Share via Email"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Email
                          </button>
                        </div>
                      </div>
                      
                      {/* Visit Content */}
                      <div className="p-4 space-y-4">
                        {/* Case Taking */}
                        {visit.caseText && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Case Notes</h4>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                              {visit.caseText}
                            </p>
                          </div>
                        )}
                        
                        {/* Prescription */}
                        {visitRx.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Prescription</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="px-3 py-2 text-left font-medium text-gray-600">Medicine</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Potency</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Dose Form</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Pattern</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Frequency</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Duration</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visitRx.map((rx, idx) => {
                                    const hasPatientDeleteRemark = rx.instructions?.includes('[Patient Requested Pharma Delete]');
                                    return (
                                      <tr key={idx} className={`border-t border-gray-100 ${hasPatientDeleteRemark ? 'bg-red-50' : ''}`}>
                                        <td className="px-3 py-2">
                                          {rx.isCombination ? (
                                            <div>
                                              <span className="text-purple-600 font-medium">{rx.combinationName || rx.medicine}</span>
                                              {rx.combinationContent && (
                                                <div className="text-xs text-gray-500 mt-1">{rx.combinationContent}</div>
                                              )}
                                            </div>
                                          ) : (
                                            <div>
                                              <span>{rx.medicine}</span>
                                              {hasPatientDeleteRemark && (
                                                <div className="text-xs text-red-600 font-medium mt-1">
                                                  ⚠ Patient Requested Deletion
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">{rx.potency || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{rx.doseForm || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{rx.dosePattern || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{rx.frequency || '-'}</td>
                                        <td className="px-3 py-2 text-gray-600">{rx.duration || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                        
                        {/* Additional Notes Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          {visit.diagnosis && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-1">Diagnosis</h4>
                              <p className="text-sm text-gray-600">{visit.diagnosis}</p>
                            </div>
                          )}
                          {visit.prognosis && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-1">Prognosis</h4>
                              <p className="text-sm text-gray-600 capitalize">{visit.prognosis}</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Advice */}
                        {visit.advice && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Advice</h4>
                            <p className="text-sm text-gray-600">{visit.advice}</p>
                          </div>
                        )}
                        
                        {/* Next Visit */}
                        {visit.nextVisit && (
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Next Visit:</span>{' '}
                            {new Date(visit.nextVisit).toLocaleDateString('en-IN', { 
                              weekday: 'short', 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                          </div>
                        )}
                        
                        {/* Tests Required */}
                        {visit.testsRequired && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Tests Required</h4>
                            <p className="text-sm text-gray-600">{visit.testsRequired}</p>
                          </div>
                        )}
                        
                        {/* Remarks */}
                        {visit.remarksToFrontdesk && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">Remarks</h4>
                            <p className="text-sm text-gray-600">{visit.remarksToFrontdesk}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      
      {showRepeatVisitChoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Repeat Visit Today</h3>
            <p className="text-sm text-gray-600">
              Create a new prescription or add medicines to today’s saved prescription?
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  setShowRepeatVisitChoice(false);
                  setSavedVisitId(null);
                  setPrescriptions([]);
                  setCaseText('');
                  setSymptoms([]);
                  setDiagnosis('');
                  setAdvice('');
                  setTestsRequired('');
                  setPrognosis('');
                  setRemarksToFrontdesk('');
                  setBp('');
                  setPulse('');
                  setTempF('');
                  setWeightKg('');
                }}
              >
                Create New
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  if (repeatVisitId) {
                    const v = doctorVisitDb.getById(repeatVisitId) as DoctorVisit | undefined;
                    if (v) {
                      setSavedVisitId(v.id);
                      setCaseText(v.caseText || '');
                      setSymptoms((v.caseText || '').split('\n').filter((s) => s.trim().length > 0));
                      setDiagnosis(v.diagnosis || '');
                      setAdvice(v.advice || '');
                      setTestsRequired(v.testsRequired || '');
      setPrognosis(v.prognosis || '');
      setRemarksToFrontdesk(v.remarksToFrontdesk || '');
      setBp((v as any).bp || '');
      setPulse((v as any).pulse || '');
      setTempF((v as any).tempF || '');
      setWeightKg((v as any).weightKg || '');
                      const rx = doctorPrescriptionDb.getByVisit(v.id);
                      setPrescriptions(rx.map((p) => ({
                        medicine: p.medicine,
                        potency: p.potency || '',
                        quantity: p.quantity,
                        doseForm: p.doseForm || '',
                        dosePattern: p.dosePattern || '',
                        frequency: p.frequency || '',
                        duration: p.duration || '',
                        durationDays: p.durationDays || 0,
                        bottles: p.bottles || 1,
                        instructions: p.instructions || '',
                        isCombination: p.isCombination || false,
                        combinationName: p.combinationName || '',
                        combinationContent: p.combinationContent || '',
                      })));
                    }
                  }
                  setShowRepeatVisitChoice(false);
                }}
              >
                Add to Old
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {showPharmacyMini && (
        <div
          className={`fixed top-20 ${pharmacyDockSide === 'right' ? 'right-4' : 'left-4'} z-[60] w-96 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden`}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">Pharmacy Queue</span>
              <span className="text-xs text-gray-500">Live</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded hover:bg-gray-100"
                title={`Dock to ${pharmacyDockSide === 'right' ? 'left' : 'right'}`}
                onClick={() => setPharmacyDockSide(pharmacyDockSide === 'right' ? 'left' : 'right')}
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                className="p-1 rounded hover:bg-gray-100"
                title="Close"
                onClick={() => setShowPharmacyMini(false)}
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {pharmacyLiveItems.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No items in pharmacy queue</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {pharmacyLiveItems.map((item) => {
                  const patient = patientDb.getById(item.patientId) as Patient | undefined;
                  const rxList = doctorPrescriptionDb.getByVisit(item.visitId) || [];
                  const todayISO = new Date().toISOString().split('T')[0];
                  const clinicApt = item.appointmentId 
                    ? appointmentDb.getById(item.appointmentId) as Appointment | undefined
                    : (appointmentDb.getByPatient(item.patientId) as Appointment[]).find((apt: Appointment) => {
                        const d = new Date(apt.appointmentDate).toISOString().split('T')[0];
                        return d === todayISO;
                      });
                  const clinicStatus = clinicApt ? (clinicApt.status as string) : 'scheduled';
                  const clinicLabel = clinicStatus === 'in-progress' ? 'Case Taking' 
                    : clinicStatus === 'sent-to-pharmacy' ? 'Sent to Pharmacy'
                    : clinicStatus === 'medicines-prepared' ? 'Medicines Prepared'
                    : clinicStatus.charAt(0).toUpperCase() + clinicStatus.slice(1);
                  const isStopped = item.status === 'stopped';
                  return (
                    <li key={item.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm truncate">
                              {patient ? `${(patient as any).firstName} ${(patient as any).lastName}` : 'Patient'}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                              clinicStatus === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                              clinicStatus === 'sent-to-pharmacy' ? 'bg-indigo-100 text-indigo-800' :
                              clinicStatus === 'medicines-prepared' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {clinicLabel}
                            </span>
                            {item.priority && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                PRIORITY
                              </span>
                            )}
                            {item.courier && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                COURIER
                              </span>
                            )}
                            {isStopped && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-gray-200 text-gray-800">
                                STOPPED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {(patient as any)?.registrationNumber} • {rxList.length} medicine(s)
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            Status: {item.status}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            className={`px-2 py-1 rounded text-xs ${isStopped ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}
                            title={isStopped ? 'Reopen Prescription' : 'Stop Prescription'}
                            onClick={() => {
                              if (isStopped) {
                                pharmacyQueueDb.update(item.id, { status: 'pending', stopReason: undefined });
                              } else {
                                pharmacyQueueDb.stop(item.id, 'Stopped by doctor');
                              }
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('pharmacy-queue-updated'));
                              }
                              setPharmacyLiveItems((pharmacyQueueDb.getAll() || []) as PharmacyQueueItem[]);
                            }}
                          >
                            {isStopped ? 'Reopen' : 'Stop'}
                          </button>
                          <button
                            className={`px-2 py-1 rounded text-xs ${item.priority ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}
                            title={item.priority ? 'Remove Priority' : 'Mark Priority'}
                            onClick={() => {
                              pharmacyQueueDb.update(item.id, { priority: !item.priority });
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('pharmacy-queue-updated'));
                              }
                              setPharmacyLiveItems((pharmacyQueueDb.getAll() || []) as PharmacyQueueItem[]);
                            }}
                          >
                            Priority
                          </button>
                          <button
                            className={`px-2 py-1 rounded text-xs ${item.courier ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
                            title={item.courier ? 'Unmark Courier' : 'Mark Courier'}
                            onClick={() => {
                              pharmacyQueueDb.update(item.id, { courier: !item.courier });
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('pharmacy-queue-updated'));
                              }
                              setPharmacyLiveItems((pharmacyQueueDb.getAll() || []) as PharmacyQueueItem[]);
                            }}
                          >
                            Courier
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Appointments Board Mini Window */}
      {showAppointmentsBoard && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[60] w-[600px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-emerald-100">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-semibold text-gray-800">Today's Appointments</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600 text-white">
                {todayAppointments.length}
              </span>
            </div>
            <button
              className="p-1 rounded hover:bg-emerald-200 transition-colors"
              title="Close"
              onClick={() => setShowAppointmentsBoard(false)}
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="max-h-[70vh] overflow-y-auto">
            {todayAppointments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>No appointments scheduled for today</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {todayAppointments.map((apt) => (
                  <div 
                    key={apt.id} 
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      nextPatientId === apt.patientId ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{apt.patientName}</h3>
                          {apt.tokenNumber && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                              Token #{apt.tokenNumber}
                            </span>
                          )}
                          {nextPatientId === apt.patientId && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                              NEXT
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">Reg:</span> {apt.registrationNumber}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          <span className="font-medium">Time:</span> {apt.appointmentTime}
                          {apt.slotName && <span> • {apt.slotName}</span>}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleCallPatient(apt.id, apt.patientId)}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          Call
                        </button>
                        {patient && patient.id !== apt.patientId && (
                          <button
                            onClick={() => handleFlagNextPatient(apt.patientId)}
                            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                              nextPatientId === apt.patientId
                                ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {nextPatientId === apt.patientId ? 'Flagged' : 'Flag Next'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Combination Medicine Modal - Removed, now using inline editor */}

      {/* End Consultation Modal - No longer needed, replaced by preview popup */}

      {/* Prescription Preview Modal */}
      {showPrescriptionPreview && patient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              {/* Prescription Header */}
              <div className="border-b-2 border-gray-800 pb-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Dr. Homeopathic Clinic</h2>
                <p className="text-gray-500">M.D. (Homeopathy)</p>
                <p className="text-gray-500">Reg. No.: HM-12345</p>
              </div>
              
              {/* Patient Info */}
              <div className="flex justify-between mb-6">
                <div>
                  {(!prescriptionSettingsView || prescriptionSettingsView.patient?.name) && (
                    <p className="font-bold">{patient.firstName} {patient.lastName}</p>
                  )}
                  <div className="text-sm text-gray-500">
                    {(!prescriptionSettingsView || prescriptionSettingsView.patient?.age) && (patient as any)?.age && <span>{(patient as any).age} yrs</span>}
                    {(!prescriptionSettingsView || prescriptionSettingsView.patient?.sex) && (patient as any)?.sex && <span>{(patient as any).sex ? ` • ${(patient as any).sex}` : ''}</span>}
                  </div>
                  {(!prescriptionSettingsView || prescriptionSettingsView.patient?.regNo) && (
                    <p className="text-sm text-gray-500">Regd No: {patient.registrationNumber}</p>
                  )}
                </div>
                <div className="text-right">
                  {(!prescriptionSettingsView || prescriptionSettingsView.patient?.visitDate) && (
                    <p className="text-sm text-gray-500">Date of Visit: {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: '2-digit' })}</p>
                  )}
                  <p className="text-sm text-gray-500">Visit: #{currentVisit?.visitNumber ?? '-'}</p>
                </div>
              </div>
              
              {/* Vitals (show only if filled and enabled) */}
              {(
                ((!prescriptionSettingsView || prescriptionSettingsView.additional?.bp) && bp) ||
                ((!prescriptionSettingsView || prescriptionSettingsView.additional?.pulse) && pulse) ||
                ((!prescriptionSettingsView || prescriptionSettingsView.additional?.tempF) && tempF) ||
                ((!prescriptionSettingsView || prescriptionSettingsView.additional?.weightKg) && weightKg)
              ) && (
                <div className="mb-4 text-sm text-gray-700">
                  {(!prescriptionSettingsView || prescriptionSettingsView.additional?.bp) && bp && <span>BP: {bp}</span>}
                  {((!prescriptionSettingsView || prescriptionSettingsView.additional?.pulse) && pulse) && <span> • Pulse: {pulse}</span>}
                  {((!prescriptionSettingsView || prescriptionSettingsView.additional?.tempF) && tempF) && <span> • Temp: {tempF}°F</span>}
                  {((!prescriptionSettingsView || prescriptionSettingsView.additional?.weightKg) && weightKg) && <span> • Weight: {weightKg}kg</span>}
                </div>
              )}
              
              {/* Case Summary */}
              {(!prescriptionSettingsView || prescriptionSettingsView.additional?.caseText) && (
                <div className="mb-6">
                  <p className="font-bold border-b border-gray-300 mb-2">Clinical Notes</p>
                  <p className="whitespace-pre-wrap">{caseText || 'No case notes recorded.'}</p>
                </div>
              )}
              
              {/* Prescription */}
              <div className="mb-6">
                <p className="font-bold border-b border-gray-300 mb-2">Rx</p>
                {prescriptions.length === 0 ? (
                  <div className="py-4 text-center text-gray-500">No prescriptions added</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left">
                        {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.medicine) && (
                          <th className="py-1">Medicine</th>
                        )}
                        {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.potency) && (
                          <th className="py-1">Potency</th>
                        )}
                        <th className="py-1">Dose</th>
                        {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.duration) && (
                          <th className="py-1">Duration</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {prescriptions.map((rx, index) => {
                        const doseParts: string[] = [];
                        if ((!prescriptionSettingsView || prescriptionSettingsView.rxFields?.quantity) && rx.quantity) doseParts.push(String(rx.quantity));
                        if ((!prescriptionSettingsView || prescriptionSettingsView.rxFields?.doseForm) && rx.doseForm) doseParts.push(rx.doseForm);
                        if ((!prescriptionSettingsView || prescriptionSettingsView.rxFields?.dosePattern) && rx.dosePattern) doseParts.push(rx.dosePattern);
                        if ((!prescriptionSettingsView || prescriptionSettingsView.rxFields?.frequency) && rx.frequency) doseParts.push(rx.frequency);
                        const doseText = doseParts.join(" ").trim();
                        return (
                          <tr key={index}>
                            {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.medicine) && (
                              <td className="py-1">
                                {rx.isCombination ? (rx.combinationName || "Combination") : rx.medicine}
                                {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.showCombinationDetails) && rx.isCombination && rx.combinationContent && (
                                  <span className="ml-1 text-xs text-gray-600">({rx.combinationContent})</span>
                                )}
                              </td>
                            )}
                            {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.potency) && (
                              <td className="py-1">{rx.potency || "-"}</td>
                            )}
                            <td className="py-1">{doseText || "-"}</td>
                            {(!prescriptionSettingsView || prescriptionSettingsView.rxFields?.duration) && (
                              <td className="py-1">{rx.duration || "-"}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* Advice */}
              {(!prescriptionSettingsView || prescriptionSettingsView.additional?.advice) && advice && (
                <div className="mb-6">
                  <p className="font-bold border-b border-gray-300 mb-2">Advice</p>
                  <p>{advice}</p>
                </div>
              )}
              
              
              
              {/* Footer */}
              <div className="border-t-2 border-gray-800 pt-4 mt-8">
                <div className="flex justify-between items-end">
                  <div className="text-left">
                    {(!prescriptionSettingsView || prescriptionSettingsView.additional?.nextVisit) && nextVisit && (
                      <p className="font-medium">Next Visit: {new Date(nextVisit).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: '2-digit' })}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold">Dr. Signature</p>
                    {doctorSignatureUrl && (
                      <img src={doctorSignatureUrl} alt="Doctor Signature" className="mt-2 h-16 max-w-full object-contain" />
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="border-t border-gray-200 bg-gray-50 p-4">
              {isConsultationEnded && (
                <div className="mb-3 p-2 bg-green-50 text-green-700 text-sm text-center rounded-lg flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Consultation saved and visit locked
                  {pharmacySent && ' • Sent to pharmacy'}
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 justify-center">
                {/* Go Back to Edit Button - Only show if consultation ended but not sent to pharmacy */}
                {isConsultationEnded && !pharmacySent && (
                  <button
                    onClick={() => {
                      setShowPrescriptionPreview(false);
                      setIsConsultationEnded(false);
                    }}
                    className="flex items-center gap-1 px-3 py-2 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                    title="Go back to edit case"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                    </svg>
                    Go Back to Edit
                  </button>
                )}
                
                {/* Print Button */}
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  title="Print Prescription"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                
                {/* WhatsApp Button */}
                <button
                  onClick={handleWhatsAppShare}
                  disabled={isWhatsAppSending}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Send prescription PDF via WhatsApp"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  {isWhatsAppSending ? 'Sending...' : 'WhatsApp'}
                </button>
                
                {/* Email Button */}
                <button
                  onClick={handleEmailShare}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  title="Share via Email"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </button>
                
                {/* Print to Pharmacy Button - Thermal Printer Format */}
                <button
                  onClick={handlePrintToPharmacy}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                  title="Print to Pharmacy (Thermal Printer)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print To Pharmacy
                </button>
                
                {/* Send to Pharmacy Button - Only show if consultation ended and not yet sent */}
                {isConsultationEnded && !pharmacySent && (
                  <>
                    <button
                      onClick={handleSendToPharmacy}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                      title="Send to Pharmacy Queue"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Send to Pharmacy
                    </button>
                    <button
                      onClick={handleSendToBilling}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                      title="Bypass Pharmacy and Send to Billing"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Send to Billing
                    </button>
                  </>
                )}
                
                {/* Pharmacy Sent Indicator */}
                {pharmacySent && (
                  <span className="flex items-center gap-1 px-3 py-2 text-sm bg-purple-200 text-purple-800 rounded-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    In Pharmacy Queue
                  </span>
                )}
                
                {/* Close Button */}
                <button
                  onClick={isConsultationEnded ? handleResetPanel : () => setShowPrescriptionPreview(false)}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  title={isConsultationEnded ? "Close and Start New Consultation" : "Close Preview"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {isConsultationEnded ? 'Close & Next Patient' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrapper component with Suspense for useSearchParams
export default function DoctorPanelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><span className="text-lg">Loading...</span></div>}>
      <DoctorPanelContent />
    </Suspense>
  );
}

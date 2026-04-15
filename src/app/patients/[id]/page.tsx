"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PhotoUpload } from "@/components/ui/PhotoUpload";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Header } from "@/components/layout/Header";
import { getCurrentUser } from "@/lib/permissions";
import { patientDb, visitDb, patientTagDb, feeHistoryDb, investigationDb, voiceNoteDb, medicineBillDb, billingQueueDb } from "@/lib/db/database";
import { doctorPrescriptionDb, doctorVisitDb } from "@/lib/db/doctor-panel";
import { generatePrescriptionHTML } from "@/lib/prescription-formatter";
import { ThermalPrinter, generateInvoiceNumber, getInvoiceSettings, getBillPrintSettings } from "@/lib/thermal-printer";
import type { Patient, PatientTag, Visit, Investigation, FeeHistoryEntry } from "@/types";
import type { MedicineBill } from "@/lib/db/schema";

// Format date helper
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Calculate age from DOB
function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

type TabType = "overview" | "visits" | "prescriptions" | "fees" | "investigations" | "bills";

export default function PatientProfilePage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [tags, setTags] = useState<PatientTag[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [feeHistory, setFeeHistory] = useState<FeeHistoryEntry[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [bills, setBills] = useState<MedicineBill[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Modal states for viewing prescriptions, bills, and fees
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [viewingPrescription, setViewingPrescription] = useState<any>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [viewingBill, setViewingBill] = useState<MedicineBill | null>(null);
  const [showFeeReceiptModal, setShowFeeReceiptModal] = useState(false);
  const [viewingFeeReceipt, setViewingFeeReceipt] = useState<FeeHistoryEntry | null>(null);
  
  // Investigation viewer state
  const [showInvestigationModal, setShowInvestigationModal] = useState(false);
  const [viewingInvestigation, setViewingInvestigation] = useState<Investigation | null>(null);
  const [investigationZoom, setInvestigationZoom] = useState(100);

  // Load patient data function
  const loadPatientData = () => {
    setIsLoading(true);
    const patientData = patientDb.getById(patientId) as Patient | undefined;
    setPatient(patientData || null);

    if (patientData) {
      const allTags = patientTagDb.getAll() as PatientTag[];
      setTags(allTags);

      const patientVisits = visitDb.getByPatient(patientId) as Visit[];
      // Sort visits by date - latest first
      const sortedVisits = patientVisits.sort((a, b) => {
        const dateA = new Date(a.visitDate).getTime();
        const dateB = new Date(b.visitDate).getTime();
        return dateB - dateA; // Latest first
      });
      setVisits(sortedVisits);

      const patientFeeHistory = feeHistoryDb.getByPatient(patientId) as FeeHistoryEntry[];
      // Sort fee history by date - latest first
      const sortedFeeHistory = patientFeeHistory.sort((a, b) => {
        const dateA = new Date(a.paidDate).getTime();
        const dateB = new Date(b.paidDate).getTime();
        return dateB - dateA; // Latest first
      });
      setFeeHistory(sortedFeeHistory);

      const patientInvestigations = investigationDb.getByPatient(patientId) as Investigation[];
      // Sort investigations by date - latest first
      const sortedInvestigations = patientInvestigations.sort((a, b) => {
        const dateA = new Date(a.uploadedAt).getTime();
        const dateB = new Date(b.uploadedAt).getTime();
        return dateB - dateA; // Latest first
      });
      setInvestigations(sortedInvestigations);

      // Load bills - latest first
      const patientBills = medicineBillDb.getByPatientId(patientId) as unknown as MedicineBill[];
      const sortedBills = (patientBills || []).sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Latest first
      });
      setBills(sortedBills);

      // Load prescriptions - latest first
      const patientPrescriptions = doctorPrescriptionDb.getByPatient(patientId);
      const sortedPrescriptions = (patientPrescriptions || []).sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Latest first
      });
      setPrescriptions(sortedPrescriptions);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadPatientData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Reload bills when bills tab is active
  useEffect(() => {
    if (activeTab === "bills") {
      loadPatientData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Get tag by ID
  const getTagById = (tagId: string): PatientTag | undefined => {
    return tags.find((t) => t.id === tagId);
  };

  // Delete patient handler
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this patient? This action cannot be undone.")) {
      return;
    }
    setDeleting(true);
    try {
      patientDb.delete(patientId);
      router.push("/patients");
    } catch (error) {
      console.error("Error deleting patient:", error);
      alert("Failed to delete patient. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  // Handle photo upload
  const handlePhotoUpload = (photoUrl: string) => {
    if (patient) {
      const updatedPatient = { ...patient, photoUrl, updatedAt: new Date() };
      patientDb.update(patientId, updatedPatient);
      setPatient(updatedPatient);
    }
  };

  // Get tag name by ID
  const getTagName = (tagId: string): string => {
    const tag = getTagById(tagId);
    return tag?.name || tagId;
  };

  // Delete visit handler
  const handleDeleteVisit = (visitId: string) => {
    if (!confirm("Are you sure you want to delete this visit? This will remove all associated data for this date.")) {
      return;
    }
    
    // Delete the visit
    visitDb.delete(visitId);
    
    // Delete all prescriptions for this visit
    const prescriptionsForVisit = doctorPrescriptionDb.getByVisit(visitId);
    prescriptionsForVisit.forEach((rx: any) => {
      doctorPrescriptionDb.delete(rx.id);
    });
    
    // Delete all billing queue items for this visit
    const allBilling = billingQueueDb.getAll() as any[];
    allBilling.filter((b: any) => b.visitId === visitId).forEach((b: any) => {
      billingQueueDb.delete(b.id);
    });
    
    // Delete all medicine bills for this visit
    const allBills = medicineBillDb.getAll() as any[];
    allBills.filter((bill: any) => bill.visitId === visitId).forEach((bill: any) => {
      medicineBillDb.delete(bill.id);
    });
    
    loadPatientData();
  };

  // Delete prescription handler
  const handleDeletePrescription = (prescriptionId: string) => {
    if (!confirm("Are you sure you want to delete this prescription?")) {
      return;
    }
    
    doctorPrescriptionDb.delete(prescriptionId);
    loadPatientData();
  };

  // Delete fee handler
  const handleDeleteFee = (feeId: string, feeDate: Date) => {
    if (!confirm("Are you sure you want to delete this fee? This will remove the complete fee amount for that day.")) {
      return;
    }
    
    // Delete the fee history entry
    feeHistoryDb.delete(feeId);
    
    // Find and delete related billing queue items for this date
    const allBilling = billingQueueDb.getAll() as any[];
    const feeDate_str = new Date(feeDate).toDateString();
    
    allBilling.filter((b: any) => {
      const billingDate = new Date(b.createdAt).toDateString();
      return b.patientId === patientId && billingDate === feeDate_str;
    }).forEach((b: any) => {
      billingQueueDb.delete(b.id);
    });
    
    loadPatientData();
  };

  // Delete bill handler
  const handleDeleteBill = (billId: string) => {
    if (!confirm("Are you sure you want to delete this bill? This will remove the complete bill amount.")) {
      return;
    }
    
    medicineBillDb.delete(billId);
    loadPatientData();
  };

  // View investigation handler
  const handleViewInvestigation = (investigation: Investigation) => {
    setViewingInvestigation(investigation);
    setInvestigationZoom(100);
    setShowInvestigationModal(true);
  };

  // Delete investigation handler
  const handleDeleteInvestigation = (investigationId: string) => {
    if (!confirm("Are you sure you want to delete this investigation?")) {
      return;
    }
    
    investigationDb.delete(investigationId);
    loadPatientData();
  };

  // View prescription handler
  const handleViewPrescription = (prescription: any) => {
    setViewingPrescription(prescription);
    setShowPrescriptionModal(true);
  };

  // Print prescription handler
  const handlePrintPrescription = () => {
    if (!viewingPrescription || !patient) return;

    const [firstName, ...lastNameParts] = patient.fullName.split(' ');
    const lastName = lastNameParts.join(' ') || '';

    const prescriptionHTML = generatePrescriptionHTML(
      {
        firstName,
        lastName,
        registrationNumber: patient.registrationNumber,
        mobileNumber: patient.mobileNumber,
        age: patient.age,
        sex: patient.gender,
      },
      [viewingPrescription],
      {
        visitDate: viewingPrescription.createdAt,
      }
    );

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(prescriptionHTML);
      printWindow.document.close();
    }
  };

  // View bill handler
  const handleViewBill = (bill: MedicineBill) => {
    setViewingBill(bill);
    setShowBillModal(true);
  };

  // Print bill handler
  const handlePrintBill = () => {
    if (!viewingBill || !patient) return;

    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    const invoiceNumber = generateInvoiceNumber('bill');

    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = viewingBill.paymentStatus || 'pending';
    const amountPaid = viewingBill.amountPaid || 0;
    const amountDue = Math.max(0, viewingBill.grandTotal - amountPaid);

    const billData = {
      invoiceNumber,
      patientName: patient.fullName,
      registrationNumber: patient.registrationNumber,
      mobileNumber: patient.mobileNumber,
      items: viewingBill.items.filter(item => item.amount > 0).map(item => ({
        description: [item.medicine, item.potency, item.quantityDisplay, item.doseForm].filter(Boolean).join(' '),
        quantity: item.quantity,
        unitPrice: item.amount / item.quantity,
        total: item.amount,
      })),
      subtotal: viewingBill.subtotal,
      discountPercent: viewingBill.discountPercent,
      discountAmount: viewingBill.discountAmount,
      taxAmount: viewingBill.taxAmount,
      netAmount: viewingBill.grandTotal,
      paymentStatus,
      amountPaid,
      amountDue,
      paymentMethod: 'cash',
      notes: viewingBill.notes,
    };

    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'bill');

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };

  // View fee receipt handler
  const handleViewFeeReceipt = (fee: FeeHistoryEntry) => {
    setViewingFeeReceipt(fee);
    setShowFeeReceiptModal(true);
  };

  // Print fee receipt handler
  const handlePrintFeeReceipt = () => {
    if (!viewingFeeReceipt || !patient) return;

    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    const invoiceNumber = generateInvoiceNumber('fee');

    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = viewingFeeReceipt.paymentStatus as any;

    const billData = {
      invoiceNumber,
      patientName: patient.fullName,
      registrationNumber: patient.registrationNumber,
      mobileNumber: patient.mobileNumber,
      items: [{
        description: viewingFeeReceipt.feeType.replace(/-/g, ' ').toUpperCase(),
        quantity: 1,
        unitPrice: viewingFeeReceipt.amount,
        total: viewingFeeReceipt.amount,
      }],
      subtotal: viewingFeeReceipt.amount,
      discountPercent: 0,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: viewingFeeReceipt.amount,
      paymentStatus,
      amountPaid: viewingFeeReceipt.amount,
      amountDue: 0,
      paymentMethod: viewingFeeReceipt.paymentMethod,
      notes: '',
    };

    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'fee');

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };

  // Calculate age - prefer patient.age, fallback to dateOfBirth
  const displayAge = (): string => {
    if (patient && patient.age && patient.age > 0) {
      return `${patient.age} yrs`;
    }
    if (patient && patient.dateOfBirth) {
      const age = calculateAge(patient.dateOfBirth);
      return age > 0 ? `${age} yrs` : 'Age not specified';
    }
    return 'Age not specified';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-medium text-gray-900 mb-2">Patient Not Found</h2>
          <p className="text-gray-500 mb-4">The patient record you&apos;re looking for doesn&apos;t exist.</p>
          <Button onClick={() => router.push("/patients")} variant="primary">
            Back to Patients
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      
      <div
        className={`transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <Header title={patient?.fullName || "Patient"} subtitle={`Registration: ${patient?.registrationNumber || ''}`} />
        
        <main className="p-6">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  {/* Avatar with Photo Upload */}
                  <div className="relative">
                    <PhotoUpload
                      currentPhotoUrl={patient?.photoUrl}
                      onPhotoUploaded={handlePhotoUpload}
                      patientName={patient?.fullName || "Patient"}
                    />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{patient?.fullName}</h1>
                    <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                      <span>{patient?.registrationNumber}</span>
                      <span>•</span>
                      <span>{displayAge()}</span>
                      <span>•</span>
                      <span className="capitalize">{patient?.gender}</span>
                      {patient?.feeExempt && (
                        <>
                          <span>•</span>
                          <Badge variant="success" size="sm">Fee Exempt</Badge>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => router.push(`/patients/${patientId}/edit`)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={handleDelete} loading={deleting}>
                  Delete
                </Button>
                <Button variant="primary" onClick={() => router.push(`/patients/${patientId}/visits/new`)}>
                  New Visit
                </Button>
              </div>
            </div>

            {/* Tags */}
            {patient?.tags && patient.tags.length > 0 && (
              <div className="mt-4 flex gap-2">
                {patient.tags.map((tagId) => {
                  const tag = getTagById(tagId);
                  if (!tag) return null;
                  return (
                    <Badge
                      key={tagId}
                      style={{ backgroundColor: tag.color + '20', color: tag.color }}
                    >
                      {tag.name}
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Tabs */}
            <div className="mt-4 flex gap-1 border-b border-gray-200 -mb-px">
              {[
                { id: "overview", label: "Overview" },
                { id: "visits", label: "Visits" },
                { id: "prescriptions", label: "Prescriptions" },
                { id: "fees", label: "Fees" },
                { id: "bills", label: "Bills" },
                { id: "investigations", label: "Investigations" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === tab.id
                      ? "text-blue-600 border-blue-600"
                      : "text-gray-500 border-transparent hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="mt-6">
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Contact Information */}
                <Card className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h2>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm text-gray-500">Mobile</dt>
                      <dd className="text-gray-900">{patient.mobileNumber}</dd>
                    </div>
                    {patient.alternateMobile && (
                      <div>
                        <dt className="text-sm text-gray-500">Alternate Mobile</dt>
                        <dd className="text-gray-900">{patient.alternateMobile}</dd>
                      </div>
                    )}
                    {patient.email && (
                      <div>
                        <dt className="text-sm text-gray-500">Email</dt>
                        <dd className="text-gray-900">{patient.email}</dd>
                      </div>
                    )}
                    {patient.address && (
                      <div>
                        <dt className="text-sm text-gray-500">Address</dt>
                        <dd className="text-gray-900">
                          {patient.address.street}<br />
                          {patient.address.city}, {patient.address.state} {patient.address.pincode}
                        </dd>
                      </div>
                    )}
                  </dl>
                </Card>

                {/* Personal Information */}
                <Card className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h2>
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-sm text-gray-500">Age</dt>
                      <dd className="text-gray-900">{displayAge()}</dd>
                    </div>
                    {patient.bloodGroup && (
                      <div>
                        <dt className="text-sm text-gray-500">Blood Group</dt>
                        <dd className="text-gray-900">{patient.bloodGroup}</dd>
                      </div>
                    )}
                    {patient.occupation && (
                      <div>
                        <dt className="text-sm text-gray-500">Occupation</dt>
                        <dd className="text-gray-900">{patient.occupation}</dd>
                      </div>
                    )}
                    {patient.maritalStatus && (
                      <div>
                        <dt className="text-sm text-gray-500">Marital Status</dt>
                        <dd className="text-gray-900 capitalize">{patient.maritalStatus}</dd>
                      </div>
                    )}
                    {patient.referredBy && (
                      <div>
                        <dt className="text-sm text-gray-500">Referred By</dt>
                        <dd className="text-gray-900">{patient.referredBy}</dd>
                      </div>
                    )}
                  </dl>
                </Card>

                {/* Medical Information */}
                <Card className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Medical Information</h2>
                  <dl className="space-y-3">
                    {patient.medicalHistory && patient.medicalHistory.length > 0 && (
                      <div>
                        <dt className="text-sm text-gray-500">Medical History</dt>
                        <dd className="flex flex-wrap gap-1 mt-1">
                          {patient.medicalHistory.map((item, i) => (
                            <Badge key={i} variant="default">{item}</Badge>
                          ))}
                        </dd>
                      </div>
                    )}
                    {patient.allergies && patient.allergies.length > 0 && (
                      <div>
                        <dt className="text-sm text-gray-500">Allergies</dt>
                        <dd className="flex flex-wrap gap-1 mt-1">
                          {patient.allergies.map((item, i) => (
                            <Badge key={i} variant="danger">{item}</Badge>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </Card>

                {/* Visit Summary */}
                <Card className="p-6 lg:col-span-2">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Visit Summary</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-900">{visits.length}</div>
                      <div className="text-sm text-gray-500">Total Visits</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-900">
                        {visits.filter((v) => v.mode === "video").length}
                      </div>
                      <div className="text-sm text-gray-500">Video Consults</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-900">
                        {visits.filter((v) => v.isSelfRepeat).length}
                      </div>
                      <div className="text-sm text-gray-500">Self-Repeats</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-3xl font-bold text-gray-900">
                        {visits.length > 0 ? formatDate(visits[0].visitDate) : "N/A"}
                      </div>
                      <div className="text-sm text-gray-500">Last Visit</div>
                    </div>
                  </div>
                </Card>

                {/* Fee Summary */}
                <Card className="p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">Fee Summary</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Paid</span>
                      <span className="font-medium">
                        ₹{feeHistory.reduce((sum, f) => sum + (f.paymentStatus === 'paid' ? f.amount : 0), 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last Payment</span>
                      <span className="font-medium">
                        {feeHistory.length > 0 ? formatDate(feeHistory[0].paidDate) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <Badge variant={patient.feeExempt ? "success" : "default"}>
                        {patient.feeExempt ? "Exempt" : "Regular"}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === "visits" && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Doctor
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Mode
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Complaint
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {visits.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                            No visits recorded yet
                          </td>
                        </tr>
                      ) : (
                        visits.map((visit) => (
                          <tr key={visit.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{formatDate(visit.visitDate)}</div>
                              <div className="text-sm text-gray-500">{visit.visitTime}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{visit.doctorName}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant="default">
                                {visit.mode === "video" ? "📹 Video" : visit.mode === "self-repeat" ? "🔄 Self-Repeat" : "🏥 In-Person"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 truncate max-w-xs">
                                {visit.chiefComplaint || "-"}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge
                                variant={visit.status === "completed" ? "success" : visit.status === "cancelled" ? "danger" : "default"}
                              >
                                {visit.status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <Button 
                                variant="danger" 
                                size="sm"
                                onClick={() => handleDeleteVisit(visit.id)}
                              >
                                Delete
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === "prescriptions" && (
              <Card className="overflow-hidden">
                {prescriptions.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Prescriptions Yet</h3>
                    <p className="text-gray-500">
                      Prescriptions will appear here after the first visit.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Visit
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(() => {
                          // Group prescriptions by visitId
                          const visitMap = new Map<string, any[]>();
                          prescriptions.forEach((prescription: any) => {
                            if (!visitMap.has(prescription.visitId)) {
                              visitMap.set(prescription.visitId, []);
                            }
                            visitMap.get(prescription.visitId)!.push(prescription);
                          });

                          // Convert to array and sort by date (latest first)
                          const groupedPrescriptions = Array.from(visitMap.entries()).map(([visitId, prxs]) => {
                            const visit = doctorVisitDb.getById(visitId);
                            return {
                              visitId,
                              visit,
                              prescriptions: prxs,
                              date: prxs[0]?.createdAt || new Date(),
                            };
                          }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                          return groupedPrescriptions.map((group) => (
                            <tr key={group.visitId} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatDate(group.date)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {group.visit ? `Visit #${group.visit.visitNumber}` : 'N/A'}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleViewPrescription(group.prescriptions[0])}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete all prescriptions for this visit?")) {
                                      group.prescriptions.forEach((rx: any) => {
                                        handleDeletePrescription(rx.id);
                                      });
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {activeTab === "fees" && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Payment
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {feeHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                            No fee history recorded yet
                          </td>
                        </tr>
                      ) : (
                        feeHistory.map((fee) => (
                          <tr key={fee.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(fee.paidDate)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                              {fee.feeType.replace("-", " ")}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              ₹{fee.amount}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                              {fee.paymentMethod}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge
                                variant={fee.paymentStatus === "paid" ? "success" : fee.paymentStatus === "pending" ? "warning" : "danger"}
                              >
                                {fee.paymentStatus}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleViewFeeReceipt(fee)}
                              >
                                View
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteFee(fee.id, fee.paidDate)}
                              >
                                Delete
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === "bills" && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Items
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Paid
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {bills.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                            No bills recorded yet
                          </td>
                        </tr>
                      ) : (
                        bills.map((bill: MedicineBill) => (
                          <tr key={bill.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(bill.createdAt)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              <div className="max-w-xs">
                                {bill.items && bill.items.length > 0 ? (
                                  <>
                                    {bill.items.slice(0, 2).map((item: any, idx: number) => (
                                      <div key={idx} className="truncate">
                                        {item.medicine} {item.potency ? `(${item.potency})` : ''}
                                      </div>
                                    ))}
                                    {bill.items.length > 2 && (
                                      <div className="text-gray-500">+{bill.items.length - 2} more</div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-gray-400">No items</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              ₹{bill.grandTotal}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              ₹{bill.amountPaid || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge
                                variant={bill.paymentStatus === "paid" ? "success" : bill.paymentStatus === "pending" ? "warning" : "info"}
                              >
                                {bill.paymentStatus || "pending"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleViewBill(bill)}
                              >
                                View
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteBill(bill.id)}
                              >
                                Delete
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === "investigations" && (
              <Card className="overflow-hidden">
                {investigations.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Investigations Yet</h3>
                    <p className="text-gray-500 mb-4">
                      Lab reports and investigations can be uploaded here.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            File Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Remarks
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Uploaded By
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {investigations.map((investigation) => (
                          <tr key={investigation.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{formatDate(investigation.uploadedAt)}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 font-medium truncate max-w-xs">
                                {investigation.fileName}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant="default">
                                {investigation.fileType.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-600 truncate max-w-xs">
                                {investigation.description || '-'}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{investigation.uploadedBy}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                              <button
                                onClick={() => handleViewInvestigation(investigation)}
                                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                              >
                                View
                              </button>
                              <a
                                href={investigation.fileUrl}
                                download={investigation.fileName}
                                className="text-green-600 hover:text-green-700 text-sm font-medium"
                              >
                                Download
                              </a>
                              <button
                                onClick={() => handleDeleteInvestigation(investigation.id)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Prescription Modal */}
          {showPrescriptionModal && viewingPrescription && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Prescription</h2>
                    <button
                      onClick={() => setShowPrescriptionModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <dt className="text-sm text-gray-500">Patient</dt>
                        <dd className="text-gray-900 font-medium">{patient?.fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Registration</dt>
                        <dd className="text-gray-900 font-medium">{patient?.registrationNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Date</dt>
                        <dd className="text-gray-900 font-medium">{formatDate(viewingPrescription.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Visit ID</dt>
                        <dd className="text-gray-900 font-medium">{viewingPrescription.visitId}</dd>
                      </div>
                    </div>

                    <div>
                      <dt className="text-sm text-gray-500 mb-2">Prescription</dt>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-300">
                              <th className="text-left py-2 px-2 font-medium text-gray-700">Medicine</th>
                              <th className="text-left py-2 px-2 font-medium text-gray-700">Potency</th>
                              <th className="text-left py-2 px-2 font-medium text-gray-700">Dose</th>
                              <th className="text-left py-2 px-2 font-medium text-gray-700">Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-200 hover:bg-gray-50">
                              <td className="py-2 px-2 text-gray-900">{viewingPrescription.medicine}</td>
                              <td className="py-2 px-2 text-gray-600">{viewingPrescription.potency || '-'}</td>
                              <td className="py-2 px-2 text-gray-600">
                                {[
                                  viewingPrescription.quantity,
                                  viewingPrescription.doseForm,
                                  viewingPrescription.dosePattern,
                                  viewingPrescription.frequency
                                ].filter(Boolean).join(' ') || '-'}
                              </td>
                              <td className="py-2 px-2 text-gray-600">{viewingPrescription.duration || '-'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      {viewingPrescription.instructions && (
                        <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                          <div className="text-sm font-medium text-blue-900">Instructions:</div>
                          <div className="text-sm text-blue-800">{viewingPrescription.instructions}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => setShowPrescriptionModal(false)}
                    >
                      Close
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handlePrintPrescription}
                    >
                      Print
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Bill Modal */}
          {showBillModal && viewingBill && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Bill</h2>
                    <button
                      onClick={() => setShowBillModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <dt className="text-sm text-gray-500">Patient</dt>
                        <dd className="text-gray-900 font-medium">{patient?.fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Registration</dt>
                        <dd className="text-gray-900 font-medium">{patient?.registrationNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Date</dt>
                        <dd className="text-gray-900 font-medium">{formatDate(viewingBill.createdAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Status</dt>
                        <dd>
                          <Badge variant={viewingBill.paymentStatus === "paid" ? "success" : "warning"}>
                            {viewingBill.paymentStatus || "pending"}
                          </Badge>
                        </dd>
                      </div>
                    </div>

                    <div className="mb-4">
                      <dt className="text-sm text-gray-500 mb-2">Items</dt>
                      <div className="space-y-2">
                        {viewingBill.items.filter(item => item.amount > 0).map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-sm p-2 bg-white rounded border border-gray-200">
                            <span className="text-gray-900">
                              {item.medicine} {item.potency ? `(${item.potency})` : ''} x {item.quantity}
                            </span>
                            <span className="font-medium text-gray-900">₹{item.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 p-3 bg-white rounded border border-gray-200">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="text-gray-900">₹{viewingBill.subtotal}</span>
                      </div>
                      {viewingBill.discountAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Discount ({viewingBill.discountPercent}%)</span>
                          <span className="text-gray-900">-₹{viewingBill.discountAmount}</span>
                        </div>
                      )}
                      {viewingBill.taxAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Tax</span>
                          <span className="text-gray-900">₹{viewingBill.taxAmount}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-medium border-t border-gray-200 pt-2">
                        <span className="text-gray-900">Total</span>
                        <span className="text-gray-900">₹{viewingBill.grandTotal}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Amount Paid</span>
                        <span className="text-gray-900">₹{viewingBill.amountPaid || 0}</span>
                      </div>
                      {(viewingBill.grandTotal - (viewingBill.amountPaid || 0)) > 0 && (
                        <div className="flex justify-between text-sm font-medium text-orange-600">
                          <span>Amount Due</span>
                          <span>₹{viewingBill.grandTotal - (viewingBill.amountPaid || 0)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => setShowBillModal(false)}
                    >
                      Close
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handlePrintBill}
                    >
                      Print
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Fee Receipt Modal */}
          {showFeeReceiptModal && viewingFeeReceipt && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">Fee Receipt</h2>
                    <button
                      onClick={() => setShowFeeReceiptModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <dt className="text-sm text-gray-500">Patient</dt>
                        <dd className="text-gray-900 font-medium">{patient?.fullName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Registration</dt>
                        <dd className="text-gray-900 font-medium">{patient?.registrationNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Date</dt>
                        <dd className="text-gray-900 font-medium">{formatDate(viewingFeeReceipt.paidDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Status</dt>
                        <dd>
                          <Badge variant={viewingFeeReceipt.paymentStatus === "paid" ? "success" : "warning"}>
                            {viewingFeeReceipt.paymentStatus}
                          </Badge>
                        </dd>
                      </div>
                    </div>

                    <div className="space-y-2 p-3 bg-white rounded border border-gray-200">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Fee Type</span>
                        <span className="text-gray-900 font-medium capitalize">
                          {viewingFeeReceipt.feeType.replace(/-/g, ' ')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Payment Method</span>
                        <span className="text-gray-900 capitalize">{viewingFeeReceipt.paymentMethod}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium border-t border-gray-200 pt-2">
                        <span className="text-gray-900">Amount</span>
                        <span className="text-gray-900">₹{viewingFeeReceipt.amount}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => setShowFeeReceiptModal(false)}
                    >
                      Close
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handlePrintFeeReceipt}
                    >
                      Print
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Investigation Viewer Modal */}
          {showInvestigationModal && viewingInvestigation && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{viewingInvestigation.fileName}</h3>
                    {viewingInvestigation.description && (
                      <p className="text-sm text-gray-600 mt-1">{viewingInvestigation.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInvestigationModal(false);
                      setViewingInvestigation(null);
                      setInvestigationZoom(100);
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
                    onClick={() => setInvestigationZoom(Math.max(50, investigationZoom - 10))}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                    title="Zoom out"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                    </svg>
                  </button>
                  <span className="text-sm font-medium text-gray-700 w-12 text-center">{investigationZoom}%</span>
                  <button
                    type="button"
                    onClick={() => setInvestigationZoom(Math.min(300, investigationZoom + 10))}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                    title="Zoom in"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvestigationZoom(100)}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
                    title="Reset zoom"
                  >
                    Reset
                  </button>
                  <div className="w-px h-6 bg-gray-300"></div>
                  <a
                    href={viewingInvestigation.fileUrl}
                    download={viewingInvestigation.fileName}
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
                  {viewingInvestigation.fileType.startsWith('pdf') ? (
                    <div className="flex flex-col items-center justify-center text-white">
                      <svg className="w-16 h-16 text-red-500 mb-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                        <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                      </svg>
                      <p className="text-lg font-medium mb-2">PDF File</p>
                      <p className="text-sm text-gray-400 mb-4">{viewingInvestigation.fileName}</p>
                      <a
                        href={viewingInvestigation.fileUrl}
                        download={viewingInvestigation.fileName}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      >
                        Download PDF
                      </a>
                    </div>
                  ) : (
                    <img
                      src={viewingInvestigation.fileUrl}
                      alt={viewingInvestigation.fileName}
                      style={{ transform: `scale(${investigationZoom / 100})`, transformOrigin: 'center' }}
                      className="transition-transform max-w-full max-h-full"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

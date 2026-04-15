# Hard Delete API Documentation

## Overview

The Hard Delete API provides endpoints for permanently deleting fees, prescriptions, and bills from the patient management system. All deletions are cascading, meaning related records are automatically deleted to maintain data integrity.

## Endpoints

### Delete Fee

**Endpoint:** `POST /api/patients/{patientId}/fees/{feeId}/hard-delete`

**Description:** Permanently delete a fee and all related records (billing queue items, receipts, refunds).

**Request Body:**
```json
{
  "userId": "string (required)",
  "reason": "string (optional)"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Fee deleted successfully",
  "deletedRecords": {
    "primary": "fee-1",
    "cascaded": ["queue-1", "receipt-1"]
  },
  "timestamp": "2024-03-08T10:30:00Z"
}
```

**Response (Validation Error - 400):**
```json
{
  "error": "Validation failed",
  "details": ["Fee has active billing queue items"],
  "warnings": ["Fee is referenced in pending receipts"]
}
```

**Response (Server Error - 500):**
```json
{
  "error": "Internal server error",
  "details": "Database transaction failed"
}
```

---

### Delete Prescription

**Endpoint:** `POST /api/patients/{patientId}/prescriptions/{prescriptionId}/hard-delete`

**Description:** Permanently delete a prescription and all related records (pharmacy queue items, prescription history).

**Request Body:**
```json
{
  "userId": "string (required)",
  "reason": "string (optional)"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Prescription deleted successfully",
  "deletedRecords": {
    "primary": "rx-1",
    "cascaded": ["pharmacy-1", "history-1"]
  },
  "timestamp": "2024-03-08T10:30:00Z"
}
```

---

### Delete Bill

**Endpoint:** `POST /api/patients/{patientId}/bills/{billId}/hard-delete`

**Description:** Permanently delete a bill and all related records (bill items, receipts).

**Request Body:**
```json
{
  "userId": "string (required)",
  "reason": "string (optional)"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Bill deleted successfully",
  "deletedRecords": {
    "primary": "bill-1",
    "cascaded": ["item-1", "receipt-1"]
  },
  "timestamp": "2024-03-08T10:30:00Z"
}
```

---

### Get Audit Log

**Endpoint:** `GET /api/audit-log`

**Description:** Retrieve audit log entries for hard delete operations.

**Query Parameters:**
- `userId` (optional): Filter by user ID
- `patientId` (optional): Filter by patient ID
- `itemType` (optional): Filter by item type (fee, prescription, bill)
- `startDate` (optional): Filter by start date (ISO 8601)
- `endDate` (optional): Filter by end date (ISO 8601)
- `format` (optional): Response format (json or csv, default: json)

**Response (Success - 200):**
```json
{
  "success": true,
  "count": 5,
  "entries": [
    {
      "id": "audit-1",
      "timestamp": "2024-03-08T10:30:00Z",
      "userId": "user-1",
      "action": "HARD_DELETE",
      "itemType": "fee",
      "itemId": "fee-1",
      "patientId": "patient-1",
      "cascadedRecords": ["queue-1"],
      "reason": "Duplicate entry",
      "immutable": true
    }
  ]
}
```

**CSV Response:**
```
ID,Timestamp,User ID,Action,Item Type,Item ID,Patient ID,Cascaded Records Count,Reason,Immutable
audit-1,2024-03-08T10:30:00Z,user-1,HARD_DELETE,fee,fee-1,patient-1,1,Duplicate entry,Yes
```

---

### Get Audit Statistics

**Endpoint:** `GET /api/audit-log/statistics`

**Description:** Get statistics about hard delete operations.

**Query Parameters:**
- `startDate` (optional): Filter by start date (ISO 8601)
- `endDate` (optional): Filter by end date (ISO 8601)

**Response (Success - 200):**
```json
{
  "success": true,
  "report": {
    "reportDate": "2024-03-08T10:30:00Z",
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-03-08T23:59:59Z"
    },
    "summary": {
      "totalDeletions": 15,
      "deletionsByType": {
        "fee": 8,
        "prescription": 4,
        "bill": 3
      },
      "deletionsByUser": {
        "user-1": 10,
        "user-2": 5
      },
      "totalCascadedRecords": 42
    },
    "entries": [...]
  }
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Validation failed | Item not found or has external dependencies |
| 400 | User ID is required | Missing required userId parameter |
| 500 | Internal server error | Database or system error |

---

## Usage Examples

### Delete a Fee

```bash
curl -X POST http://localhost:3000/api/patients/patient-1/fees/fee-1/hard-delete \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-1",
    "reason": "Duplicate fee entry"
  }'
```

### Get Audit Log for a Patient

```bash
curl http://localhost:3000/api/audit-log?patientId=patient-1
```

### Export Audit Log as CSV

```bash
curl http://localhost:3000/api/audit-log?format=csv > audit-log.csv
```

### Get Statistics for Date Range

```bash
curl "http://localhost:3000/api/audit-log/statistics?startDate=2024-01-01&endDate=2024-03-08"
```

---

## Important Notes

1. **Permanent Deletion**: Hard delete operations are permanent and cannot be undone. All related records are automatically deleted.

2. **Audit Trail**: All hard delete operations are logged in the audit log with timestamp, user ID, and reason.

3. **Validation**: The API validates that the item exists and checks for external dependencies before deletion.

4. **Cascade Deletion**: Related records are deleted in the correct order to maintain referential integrity.

5. **Error Handling**: If deletion fails, the entire transaction is rolled back to maintain data consistency.

---

## Integration with UI

Use the `useHardDelete` hook in React components:

```typescript
import { useHardDelete } from '@/lib/hooks/useHardDelete';

export function DeleteFeeButton({ feeId, patientId, userId }) {
  const { deleteFee, isLoading, error, success } = useHardDelete({
    userId,
    patientId,
  });

  const handleDelete = async () => {
    try {
      await deleteFee(feeId, 'Duplicate entry');
      // Handle success
    } catch (err) {
      // Handle error
    }
  };

  return (
    <button onClick={handleDelete} disabled={isLoading}>
      {isLoading ? 'Deleting...' : 'Delete Fee'}
    </button>
  );
}
```

Use the confirmation dialog:

```typescript
import { HardDeleteConfirmationDialog } from '@/components/hard-delete/HardDeleteConfirmationDialog';

export function FeeItem({ fee, patientId, userId }) {
  const [showDialog, setShowDialog] = useState(false);
  const { deleteFee } = useHardDelete({ userId, patientId });

  return (
    <>
      <button onClick={() => setShowDialog(true)}>Delete</button>
      <HardDeleteConfirmationDialog
        isOpen={showDialog}
        itemType="fee"
        itemDetails={{
          id: fee.id,
          amount: fee.amount,
        }}
        onConfirm={async (reason) => {
          await deleteFee(fee.id, reason);
          setShowDialog(false);
        }}
        onCancel={() => setShowDialog(false)}
      />
    </>
  );
}
```

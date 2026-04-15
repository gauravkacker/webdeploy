export default function LicensingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Simple layout - no auth checks here
  // Auth is handled at page level
  return children;
}

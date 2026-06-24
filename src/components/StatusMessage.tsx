export function StatusMessage({ message, type = 'info' }: { message: string; type?: 'info' | 'success' | 'error' }) {
  if (!message) return null;
  return <div className={`status ${type}`}>{message}</div>;
}

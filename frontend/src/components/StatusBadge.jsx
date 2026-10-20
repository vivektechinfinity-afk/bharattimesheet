const STYLES = {
  Draft: 'badge badge-draft',
  Submitted: 'badge badge-submitted',
  Approved: 'badge badge-approved',
  Rejected: 'badge badge-rejected',
};

export default function StatusBadge({ status }) {
  return <span className={STYLES[status] || STYLES.Draft}>{status}</span>;
}

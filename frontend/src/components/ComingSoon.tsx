export default function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <div
        style={{
          marginTop: '1rem',
          padding: '2rem',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          background: '#fff',
          color: '#6b7280',
          textAlign: 'center',
        }}
      >
        Coming in next phase
      </div>
    </div>
  );
}

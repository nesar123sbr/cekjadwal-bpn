export default function TopographicBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 opacity-[0.05] bg-repeat bg-[length:600px] mix-blend-multiply"
      style={{ backgroundImage: "url('/contour-bg.svg')" }}
      aria-hidden="true"
    />
  );
}

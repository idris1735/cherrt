import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark">
      <Image alt="Chertt logo" className="brand-mark__logo" height={44} priority src="/logo.png" width={44} />
      {!compact ? <p className="brand-mark__tag">Chat-first workflows for modern organizations</p> : null}
    </div>
  );
}

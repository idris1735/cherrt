import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <header className="section-heading">
      <div>
        {eyebrow ? <p className="section-heading__eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {body ? <p className="section-heading__body">{body}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

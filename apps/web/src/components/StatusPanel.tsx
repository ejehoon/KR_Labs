import { Library } from "lucide-react";

export function StatusPanel({ title, body, tone = "default" }: { title: string; body: string; tone?: "default" | "error" }) {
  return (
    <div className={`status-panel ${tone}`}>
      <Library size={18} />
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Modal, Field, Select } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { FeedbackPoll } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function PollCreateModal({ open, onClose }: Props) {
  const { snapshot, addPoll } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [title, setTitle] = useState("");
  const [lane, setLane] = useState("pulse");
  const [audience, setAudience] = useState("All staff");
  const [options, setOptions] = useState<string[]>(["",""]);
  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate() {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = "Required";
    const filled = options.filter(o=>o.trim());
    if (filled.length < 2) e.options = "At least 2 options required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    const record: FeedbackPoll = {
      id: crypto.randomUUID(), title: title.trim(), lane: lane as "pulse"|"approval"|"guest",
      audience: audience.trim()||"All staff", owner: snapshot.membership.userName,
      options: options.filter(o=>o.trim()), questionCount: 1, responseCount: 0, targetCount: 40, status: "active", updatedAtLabel: "Just now",
    };
    addPoll(record);
    notify({ title: "Poll created" });
    onClose(); setTitle(""); setLane("pulse"); setAudience("All staff"); setOptions(["",""]); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Create poll" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Create a poll: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Create poll</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Title" required error={errors.title}><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Team lunch preference" /></Field>
        <Field label="Lane"><Select value={lane} onChange={e=>setLane(e.target.value)} options={[{value:"pulse",label:"Pulse"},{value:"approval",label:"Approval"},{value:"guest",label:"Guest"}]} /></Field>
        <Field label="Audience"><input className="ui-input" style={{width:"100%"}} value={audience} onChange={e=>setAudience(e.target.value)} /></Field>
      </div>
      <Field label="Options" required error={errors.options}>
        <div style={{display:"grid",gap:"6px",marginTop:"4px"}}>
          {options.map((o,i)=>(
            <div key={i} style={{display:"flex",gap:"6px"}}>
              <input className="ui-input" style={{flex:1}} value={o} onChange={e=>{const n=[...options];n[i]=e.target.value;setOptions(n);}} placeholder={`Option ${i+1}`} />
              {options.length>2 && <button type="button" onClick={()=>setOptions(options.filter((_,j)=>j!==i))} style={{width:"32px",height:"32px",border:"1px solid #ebebeb",borderRadius:"8px",background:"#fff",cursor:"pointer",color:"#a3a3a3"}}>−</button>}
            </div>
          ))}
          <button type="button" onClick={()=>setOptions([...options,""])} className="button button--ghost" style={{fontSize:"0.72rem"}}>+ Add option</button>
        </div>
      </Field>
    </Modal>
  );
}
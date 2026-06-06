"use client";

import { useState } from "react";
import { Modal, Field } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { Appointment } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function AppointmentCreateModal({ open, onClose }: Props) {
  const { snapshot, addAppointment } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function submit() {
    if (!title.trim()) { setErrors({title:"Required"}); return; }
    addAppointment({ id: crypto.randomUUID(), title: title.trim(), when: when.trim()||"TBD", owner: snapshot.membership.userName });
    notify({ title: "Appointment scheduled" }); onClose(); setTitle(""); setWhen(""); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule appointment" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Schedule an appointment: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Schedule</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Title" required error={errors.title}><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Vendor meeting" /></Field>
        <Field label="When"><input className="ui-input" style={{width:"100%"}} value={when} onChange={e=>setWhen(e.target.value)} placeholder="e.g. Friday 2pm" /></Field>
      </div>
    </Modal>
  );
}
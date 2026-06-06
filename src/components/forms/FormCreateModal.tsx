"use client";

import { useState } from "react";
import { Modal, Field } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { FormDefinition } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function FormCreateModal({ open, onClose }: Props) {
  const { snapshot, addForm } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function submit() {
    if (!name.trim()) { setErrors({name:"Required"}); return; }
    addForm({ id: crypto.randomUUID(), name: name.trim(), owner: snapshot.membership.userName, submissions: 0 });
    notify({ title: "Form created" }); onClose(); setName(""); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Create form" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Create a form: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Create</button>
      </>
    }>
      <Field label="Form name" required error={errors.name}><input className="ui-input" style={{width:"100%"}} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Leave application" /></Field>
    </Modal>
  );
}
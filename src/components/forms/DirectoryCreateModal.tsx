"use client";

import { useState } from "react";
import { Modal, Field } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import type { Person } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function DirectoryCreateModal({ open, onClose }: Props) {
  const { addPerson } = useAppState();
  const { notify } = useToast();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function submit() {
    if (!name.trim()) { setErrors({name:"Required"}); return; }
    addPerson({ id: crypto.randomUUID(), name: name.trim(), title: title.trim(), unit: unit.trim(), phone: phone.trim() });
    notify({ title: "Person added" }); onClose(); setName(""); setTitle(""); setUnit(""); setPhone(""); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Add person" footer={
      <button className="button button--primary" onClick={submit} type="button">Add person</button>
    }>
      <div className="ui-form-grid">
        <Field label="Name" required error={errors.name}><input className="ui-input" style={{width:"100%"}} value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" /></Field>
        <Field label="Title"><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Manager" /></Field>
        <Field label="Unit"><input className="ui-input" style={{width:"100%"}} value={unit} onChange={e=>setUnit(e.target.value)} placeholder="e.g. Operations" /></Field>
        <Field label="Phone"><input className="ui-input" style={{width:"100%"}} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="080..." /></Field>
      </div>
    </Modal>
  );
}
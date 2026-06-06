"use client";

import { useState } from "react";
import { Modal, Field } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { InventoryItem } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function InventoryCreateModal({ open, onClose }: Props) {
  const { addInventoryItem } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("Main store");
  const [inStock, setInStock] = useState("0");
  const [minLevel, setMinLevel] = useState("5");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate() {
    const e: Record<string,string> = {};
    if (!name.trim()) e.name = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    const record: InventoryItem = {
      id: crypto.randomUUID(), name: name.trim(), location: location.trim() || "Main store",
      inStock: parseInt(inStock,10)||0, minLevel: parseInt(minLevel,10)||5, reserved: 0,
    };
    addInventoryItem(record);
    notify({ title: "Item added" });
    onClose(); setName(""); setLocation("Main store"); setInStock("0"); setMinLevel("5"); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Add inventory item" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Add inventory item: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Add item</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Name" required error={errors.name}><input className="ui-input" style={{width:"100%"}} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Printer paper" /></Field>
        <Field label="Location"><input className="ui-input" style={{width:"100%"}} value={location} onChange={e=>setLocation(e.target.value)} /></Field>
        <Field label="In stock"><input className="ui-input" style={{width:"100%"}} type="number" value={inStock} onChange={e=>setInStock(e.target.value)} /></Field>
        <Field label="Min level"><input className="ui-input" style={{width:"100%"}} type="number" value={minLevel} onChange={e=>setMinLevel(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
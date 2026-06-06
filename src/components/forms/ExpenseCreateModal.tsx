"use client";

import { useState } from "react";
import { Modal, Field, Select } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { ExpenseEntry } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

const DEPTS = ["Operations","Admin","Facilities","Finance","Sales"];

export function ExpenseCreateModal({ open, onClose }: Props) {
  const { snapshot, addExpense } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState("Operations");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate() {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = "Required";
    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) e.amount = "Enter a valid amount";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    const record: ExpenseEntry = {
      id: crypto.randomUUID(), title: title.trim(), department: dept,
      amount: parseFloat(amount), status: "pending", receiptCount: 0,
      attachments: [],
    };
    addExpense(record);
    notify({ title: "Expense logged" });
    onClose(); setTitle(""); setAmount(""); setDept("Operations"); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Log expense" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Log an expense: ");onClose();}}>Prefer to type it? Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Save expense</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Title" required error={errors.title}><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Diesel top-up" /></Field>
        <Field label="Department"><Select value={dept} onChange={e=>setDept(e.target.value)} options={DEPTS.map(d=>({value:d,label:d}))} /></Field>
        <Field label="Amount (₦)" required error={errors.amount}><input className="ui-input" style={{width:"100%"}} type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" /></Field>
      </div>
    </Modal>
  );
}
"use client";

import { useState } from "react";
import { Modal, Field, Select } from "@/components/ui";
import { useAppState } from "@/components/providers/app-state-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAssistantCtx } from "@/components/assistant/assistant-context";
import type { WorkflowRequest } from "@/lib/types";

type Props = { open: boolean; onClose: () => void };

export function RequestCreateModal({ open, onClose }: Props) {
  const { snapshot, addRequest } = useAppState();
  const { notify } = useToast();
  const { openAssistant } = useAssistantCtx();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Expense");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [errors, setErrors] = useState<Record<string,string>>({});

  function validate() {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) return;
    const record: WorkflowRequest = {
      id: crypto.randomUUID(), title: title.trim(), type,
      description: desc.trim(), requester: snapshot.membership.userName,
      amount: amount ? parseFloat(amount) : undefined,
      status: "pending", module: "toolkit", createdAtLabel: "Just now",
      approvalSteps: [
        { id: crypto.randomUUID(), label: "Finance review", assignee: "Finance", dueLabel: "Pending", completed: false },
        { id: crypto.randomUUID(), label: "Executive approval", assignee: "Admin", dueLabel: "Pending", completed: false },
      ],
    };
    addRequest(record);
    notify({ title: "Request submitted" });
    onClose(); setTitle(""); setAmount(""); setDesc(""); setType("Expense"); setErrors({});
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise request" footer={
      <>
        <span style={{fontSize:"0.72rem",color:"#a3a3a3",cursor:"pointer"}} onClick={()=>{openAssistant("Raise a request: ");onClose();}}>Ask Chertt →</span>
        <button className="button button--primary" onClick={submit} type="button">Submit request</button>
      </>
    }>
      <div className="ui-form-grid">
        <Field label="Title" required error={errors.title}><input className="ui-input" style={{width:"100%"}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Office chairs" /></Field>
        <Field label="Type"><Select value={type} onChange={e=>setType(e.target.value)} options={["Expense","Maintenance","Approval","Supply"].map(v=>({value:v,label:v}))} /></Field>
        <Field label="Amount (₦)" hint="Optional"><input className="ui-input" style={{width:"100%"}} type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" /></Field>
      </div>
      <Field label="Description"><textarea className="ui-textarea" style={{width:"100%",marginTop:"12px"}} rows={3} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Details..." /></Field>
    </Modal>
  );
}
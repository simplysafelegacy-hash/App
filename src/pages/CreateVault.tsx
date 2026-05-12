import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";

export default function CreateVault() {
  const { createVault, currentUser } = useApp();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    fullName: currentUser?.name || "",
    email: currentUser?.email || "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await createVault(formData);
    navigate("/dashboard");
  };

  return (
    <Layout showFooter={false}>
      <div className="container py-16 md:py-24">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12 fade-in-up">
            <p className="eyebrow mb-5">Step II · of III</p>
            <h1 className="display-serif text-5xl md:text-6xl leading-[0.98] text-balance">
              Tell us where <br />
              <span className="italic-serif text-seal">to send word.</span>
            </h1>
            <p className="mt-6 text-lg text-ink-muted max-w-xl">
              We keep two things on file: your own details, and the person you
              would want us to speak to if something happened to you.
            </p>
          </header>

          <form
            onSubmit={onSubmit}
            className="space-y-16 paper-card p-8 md:p-14 fade-in-up delay-200"
            style={{ borderRadius: "2px" }}
          >
            <Section
              number="I"
              title="Your details"
              note="These are used only to identify you and to correspond privately with you."
            >
              <FieldRow
                label="Full legal name"
                name="fullName"
                placeholder="Jane Eliza Mitchell"
                value={formData.fullName}
                onChange={onChange}
                required
              />
              <FieldRow
                label="Email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                value={formData.email}
                onChange={onChange}
                required
              />
              <FieldRow
                label="Telephone"
                name="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phone}
                onChange={onChange}
                required
              />
            </Section>

            <div className="rule-dotted" />

            <Section
              number="II"
              title="Emergency contact"
              note="The person we would contact first — usually a spouse, adult child, or executor."
            >
              <FieldRow
                label="Contact's name"
                name="emergencyContactName"
                placeholder="Michael Mitchell"
                value={formData.emergencyContactName}
                onChange={onChange}
                required
              />
              <FieldRow
                label="Contact's telephone"
                name="emergencyContactPhone"
                type="tel"
                placeholder="(555) 987-6543"
                value={formData.emergencyContactPhone}
                onChange={onChange}
                required
              />
            </Section>

            <div className="rule" />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="italic-serif text-ink-subtle text-sm">
                You may amend this later from your vault.
              </p>
              <button type="submit" disabled={isLoading} className="btn-ink w-full sm:w-auto">
                {isLoading ? "Sealing…" : "Seal and continue"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

function Section({
  number,
  title,
  note,
  children,
}: {
  number: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
      <div className="md:col-span-4">
        <div className="flex items-baseline gap-4">
          <span
            className="font-serif text-seal text-4xl tnum"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            {number}.
          </span>
          <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
        </div>
        <p className="mt-4 italic-serif text-ink-muted">{note}</p>
      </div>
      <div className="md:col-span-8 space-y-6">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        className="field"
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";

export default function CreateVault() {
  const { createVault, currentUser, userOwnsVault, vaults, selectVault } = useApp();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // A user can only own one vault (UNIQUE owner_id at the DB layer).
  // If they already do, bounce them to the dashboard rather than risk
  // them overwriting their existing vault's metadata via this form.
  useEffect(() => {
    if (userOwnsVault) {
      const owned = vaults.find((v) => v.role === "owner");
      if (owned) selectVault(owned.id);
      navigate("/dashboard", { replace: true });
    }
  }, [userOwnsVault, vaults, selectVault, navigate]);

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
      <div className="container py-10 md:py-14 max-w-2xl">
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Set up your vault
          </h1>
          <p className="text-lg text-muted-foreground">
            Your own details, and the person we should contact in an emergency.
          </p>
        </header>

        <form onSubmit={onSubmit} className="card-surface p-6 md:p-8 space-y-10">
          <Section title="Your details">
            <Field
              label="Full name"
              name="fullName"
              placeholder="Jane Mitchell"
              value={formData.fullName}
              onChange={onChange}
              required
            />
            <Field
              label="Email"
              name="email"
              type="email"
              placeholder="jane@example.com"
              value={formData.email}
              onChange={onChange}
              required
            />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={formData.phone}
              onChange={onChange}
              required
            />
          </Section>

          <Section
            title="Emergency contact"
            hint="The person we'd contact first — usually a spouse, adult child, or executor."
          >
            <Field
              label="Contact's name"
              name="emergencyContactName"
              placeholder="Michael Mitchell"
              value={formData.emergencyContactName}
              onChange={onChange}
              required
            />
            <Field
              label="Contact's phone"
              name="emergencyContactPhone"
              type="tel"
              placeholder="(555) 987-6543"
              value={formData.emergencyContactPhone}
              onChange={onChange}
              required
            />
          </Section>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              You can change this later.
            </p>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full sm:w-auto"
            >
              {isLoading ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">{title}</h2>
      {hint && <p className="text-base text-muted-foreground mb-5">{hint}</p>}
      <div className="space-y-4 mt-4">{children}</div>
    </div>
  );
}

function Field({
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

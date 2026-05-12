import { Link } from "react-router-dom";
import { SealMark } from "@/components/SealMark";

export function Footer() {
  return (
    <footer className="border-t border-hairline-soft mt-24">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5">
            <SealMark size={32} />
            <p className="mt-5 text-ink-muted max-w-sm leading-relaxed">
              A quiet place to record where your important papers rest, and who
              may see them.
            </p>
          </div>
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <FooterCol
              title="The Vault"
              links={[
                { to: "/dashboard", label: "Your vault" },
                { to: "/viewers", label: "Authorized viewers" },
                { to: "/add-document", label: "Add a document" },
              ]}
            />
            <FooterCol
              title="Service"
              links={[
                { to: "/plans", label: "Subscriptions" },
                { to: "#", label: "Security" },
                { to: "#", label: "Legal basics" },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { to: "#", label: "About" },
                { to: "#", label: "Contact" },
                { to: "#", label: "Privacy" },
              ]}
            />
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-hairline-soft flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-ink-subtle">
            © {new Date().getFullYear()} Sealed. All rights reserved.
          </p>
          <p className="italic-serif text-sm text-ink-subtle">
            Kept with care, released only as you have asked.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { to: string; label: string }[];
}) {
  return (
    <div>
      <p className="eyebrow mb-4">{title}</p>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              to={l.to}
              className="text-ink hover:text-seal transition-colors text-[15px]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

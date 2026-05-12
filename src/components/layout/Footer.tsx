import { Link } from "react-router-dom";
import { SealMark } from "@/components/SealMark";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="container py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <SealMark size={28} />
          <nav className="flex flex-wrap items-center gap-x-8 gap-y-3 text-base">
            <Link to="/plans" className="text-muted-foreground hover:text-foreground transition-colors">
              Plans
            </Link>
            <Link to="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Security
            </Link>
            <Link to="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="#" className="text-muted-foreground hover:text-foreground transition-colors">
              Contact
            </Link>
          </nav>
        </div>
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Simply Safe Legacy. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

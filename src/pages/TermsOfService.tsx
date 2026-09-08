import { LegalDocument } from "@/components/layout/LegalLayout";

/**
 * Terms of Service — /legal/terms
 *
 * Transcribed from the New Jersey launch working draft. As with the Privacy
 * Policy, unresolved placeholders are rendered visibly rather than guessed:
 *
 *   - the effective date (EFFECTIVE_DATE below)
 *
 * Two placeholders in the draft were resolvable from the document itself and
 * are filled in:
 *
 *   - [SAFE LEGACY LEGAL ENTITY NAME] → the entity named in the draft's
 *     "TO CONFIRM" block and again in section 21, phrased to match the
 *     Privacy Policy's opening paragraph.
 *   - [ACCOUNT-CLOSURE PATH] → the support email, matching how the Privacy
 *     Policy (sections 7 and 8) tells users to request account deletion.
 *     There is no in-product account-closure UI yet; if one ships, update
 *     section 14 here and the Privacy Policy together.
 *
 * The draft's internal "TO CONFIRM" bracket is omitted from the public text;
 * its content is reflected in the contact section.
 *
 * When the text is revised materially, bump LegalDocumentVersion in
 * backend/internal/handlers/legal.go so consent rows record which revision
 * was accepted.
 */

const EFFECTIVE_DATE = "September 8, 2026";
const CONTACT_EMAIL = "simplysafelegacy@gmail.com";

export default function TermsOfService() {
  return (
    <LegalDocument title="Terms of Service" effectiveDate={EFFECTIVE_DATE}>
      <p>
        These Terms of Service ("Terms") are a binding agreement between you
        and Wills Repository LLC, doing business as Simply Safe Legacy ("Safe
        Legacy," "we," "us," or "our") governing your use of the Safe Legacy
        mobile application, website, and related services (collectively, the
        "Services").
      </p>

      <div className="my-8 border-l-2 border-border pl-5">
        <p className="!text-foreground !font-semibold !mb-2">
          PLEASE READ CAREFULLY
        </p>
        <p className="!mb-0">
          Safe Legacy is a technology platform, not a law firm, fiduciary,
          executor, trustee, health-care provider, financial institution,
          emergency service, or document custodian appointed by a court. The
          Services do not provide legal, tax, financial, medical, or funeral
          advice.
        </p>
      </div>

      <h2>1. Acceptance and Eligibility</h2>
      <p>
        By creating an account, clicking an acceptance control, purchasing a
        paid tier, accepting an invitation, or otherwise using the Services,
        you agree to these Terms and acknowledge the Privacy Policy. If you do
        not agree, do not use the Services. You must be at least 18 years old,
        legally capable of entering a contract, and a resident of New Jersey.
        You may use the Services only for yourself or for another person when
        you have lawful authority and all required permissions.
      </p>
      <p>
        If you use the Services on behalf of an organization, you represent
        that you have authority to bind it; however, consumer vault accounts
        remain governed by the permissions and ownership rules presented in the
        product.
      </p>

      <h2>2. The Services</h2>
      <p>
        Safe Legacy provides tools to store, organize, retrieve, and
        selectively share information and documents concerning estate,
        incapacity, emergency, funeral, property, and legacy planning. Features
        may differ between free and paid tiers and may change over time.
      </p>
      <p>
        Safe Legacy does not draft, execute, witness, notarize, validate,
        update, interpret, or probate legal documents. Uploading a document
        does not make it legally valid, and a copy in the Services may not
        satisfy rules governing an original document. The Services do not
        guarantee that information will be accepted by a court, financial
        institution, health-care provider, government agency, or other third
        party.
      </p>
      <p>
        You remain responsible for obtaining professional advice, properly
        executing and preserving originals, keeping information accurate and
        current, reviewing beneficiary designations and legal instruments, and
        telling appropriate people where legally operative originals are
        located.
      </p>

      <h2>3. Accounts and Security</h2>
      <p>
        You must provide accurate information, keep it current, maintain the
        confidentiality of credentials, use available security features, and
        promptly notify us of suspected unauthorized access. You are
        responsible for activity through your account unless caused by our
        breach of these Terms or applicable law. We may require identity
        verification, additional authentication, or supporting documentation
        before allowing sensitive actions or restoring access.
      </p>
      <p>
        You may not share login credentials. Each family member, delegate, or
        professional must use an individual account. Safe Legacy may suspend
        access when we reasonably suspect fraud, compromise, unlawful conduct,
        conflicting authority, or a security risk.
      </p>

      <h2>4. Your Vault Content</h2>
      <p>
        As between you and Safe Legacy, you retain ownership of the documents,
        information, messages, photographs, instructions, and other content you
        submit ("User Content"). You grant Safe Legacy a limited, nonexclusive,
        worldwide license to host, reproduce, transmit, display, format, back
        up, and otherwise process User Content solely as reasonably necessary
        to provide, secure, support, and improve the Services, comply with law,
        and enforce these Terms. This license ends when User Content is deleted
        from active systems, subject to lawful retention, security records, and
        backup cycles.
      </p>
      <p>
        You represent that you have the rights, authority, permissions, and
        lawful basis needed to submit and share User Content. You are
        responsible for its accuracy, legality, quality, and suitability and
        for avoiding unnecessary personal information about other people. You
        must not upload unlawful material, malicious code, content that
        infringes another person's rights, or information you are legally
        prohibited from possessing or disclosing.
      </p>

      <h2>5. Family Members, Delegates, and Permissions</h2>
      <p>
        An account holder may invite people and assign access to selected
        materials. The account holder is solely responsible for selecting
        recipients, confirming their identities and contact information,
        choosing permissions, reviewing access, and revoking permissions when
        appropriate. A recipient is responsible for safeguarding information
        received and using it only for lawful, authorized purposes.
      </p>
      <p>
        A permission in Safe Legacy controls technical access within the
        Services only. It does not create or prove a power of attorney, agency,
        fiduciary duty, executorship, trusteeship, beneficiary designation,
        health-care proxy, or other legal status. It does not supersede a will,
        trust, court order, contract, or applicable law. Revoking a permission
        in the Services does not revoke legal authority created elsewhere.
        Likewise, possession of separate legal authority does not guarantee
        immediate access through the Services.
      </p>
      <p>
        Authorized recipients may be able to view, download, print, copy, or
        independently store shared information. Safe Legacy cannot control
        copies after they leave the Services. If recipients or legal claimants
        disagree, we may preserve the status quo, restrict access, request
        additional documentation, or require the parties to resolve the dispute
        without Safe Legacy deciding their rights.
      </p>

      <h2>6. Death, Incapacity, and Emergency Requests</h2>
      <p>
        Features intended for use after death, incapacity, or an emergency
        depend on the settings selected by the account holder, successful
        verification, the availability of the Services, and any review process
        then in effect. Safe Legacy is not an emergency service and must not be
        relied on for urgent medical, safety, or time-sensitive action. Call
        911 or the appropriate emergency provider when necessary.
      </p>
      <p>
        We may require a death certificate, court appointment, power of
        attorney, health-care directive, identification, or other evidence
        before acting on a request. We may decline or delay action if authority
        is disputed, documents appear inconsistent or insufficient, disclosure
        may violate law or another person's rights, or security concerns exist.
        You should maintain independent copies and alternative access
        arrangements for critical information.
      </p>

      <h2>7. Identity Verification</h2>
      <p>
        We may use a third-party provider to verify identity, deter fraud,
        restore accounts, or authorize sensitive actions. You authorize Safe
        Legacy and its provider to process the information reasonably necessary
        for the disclosed verification purpose, subject to the Privacy Policy
        and the provider's applicable notice. Verification does not establish
        legal capacity, ownership of uploaded materials, or authority to act
        for another person. We may require reverification and may decline
        access if verification cannot be completed.
      </p>

      <h2>8. Free and Paid Tiers</h2>
      <p>
        Safe Legacy may offer free features and one or more paid subscription
        tiers. The price, billing period, included features, renewal terms,
        applicable taxes, and any trial or promotional terms will be disclosed
        before you purchase a paid subscription.
      </p>
      <p>
        Paid subscriptions automatically renew for the applicable billing
        period unless canceled before the next renewal date. By purchasing a
        paid subscription, you authorize Safe Legacy and its payment processor,
        Stripe, to charge the payment method you provide for recurring
        subscription fees and applicable taxes.
      </p>
      <p>
        You may cancel your subscription at any time through the billing or
        subscription settings in the Safe Legacy application. Cancellation
        prevents future renewals and takes effect at the end of your
        then-current paid billing period. You will continue to have access to
        paid features through the end of that period unless your account is
        terminated for a violation of these Terms.
      </p>
      <p>
        Except where required by law or expressly stated otherwise at the time
        of purchase, subscription payments are non-refundable, and we do not
        provide refunds or credits for partially used billing periods.
      </p>
      <p>
        If a payment cannot be successfully processed, we may notify you and
        may suspend, restrict, or downgrade paid features until payment is
        successfully completed.
      </p>
      <p>
        We may change subscription prices or the features included in a paid
        tier from time to time. Any price change will apply prospectively and
        no earlier than a subsequent renewal period after any notice required
        by applicable law.
      </p>

      <h2>9. Acceptable Use</h2>
      <p>You may not:</p>
      <ul>
        <li>
          use the Services unlawfully, deceptively, or to exploit, threaten,
          harass, impersonate, surveil, or harm another person;
        </li>
        <li>
          access or attempt to access another account or content without
          authorization;
        </li>
        <li>
          misrepresent identity, death, incapacity, authority, relationship, or
          entitlement to information;
        </li>
        <li>
          upload malware or interfere with the security, integrity,
          availability, or operation of the Services;
        </li>
        <li>
          probe, scan, test, bypass, reverse engineer, scrape, or use automated
          means against the Services except as expressly permitted by law or
          written authorization;
        </li>
        <li>
          resell, sublicense, or commercially exploit the Services or use them
          to create a competing product;
        </li>
        <li>
          infringe intellectual-property, privacy, confidentiality, publicity,
          or other rights; or
        </li>
        <li>
          use vault content or access obtained through the Services for an
          unauthorized purpose.
        </li>
      </ul>

      <h2>10. Intellectual Property and Feedback</h2>
      <p>
        The Services, including software, design, interfaces, branding,
        documentation, and other materials supplied by Safe Legacy, are owned
        by Safe Legacy or its licensors and protected by law. Subject to these
        Terms, Safe Legacy grants you a limited, personal, revocable,
        nonexclusive, nontransferable license to use the Services for their
        intended purpose. No other rights are granted.
      </p>
      <p>
        If you provide ideas or feedback, you grant Safe Legacy a perpetual,
        irrevocable, worldwide, royalty-free right to use them without
        restriction or compensation, provided we do not identify you publicly
        without permission.
      </p>

      <h2>11. Third-Party Services</h2>
      <p>
        The Services may rely on or link to cloud storage, identity
        verification, payment, authentication, communications, app-store, and
        other third-party services. Their separate terms and notices may apply.
        Safe Legacy does not control third-party services and is not
        responsible for their independent acts, content, availability, or
        security, except to the extent responsibility cannot be disclaimed
        under applicable law.
      </p>

      <h2>12. Service Changes, Availability, and Backups</h2>
      <p>
        We may add, modify, suspend, or discontinue features. We do not
        guarantee uninterrupted, error-free, or permanent availability, or that
        every file format will remain readable. Maintenance, outages, cyber
        incidents, provider failures, legal restrictions, or events beyond
        reasonable control may affect access. Safe Legacy is not your sole
        archival system. You must retain independent copies of legally
        operative originals and any information needed urgently or whose loss
        would cause material harm.
      </p>
      <p>
        We may offer beta or preview features that are incomplete and may
        change or end. Additional terms may apply to those features.
      </p>

      <h2>13. Privacy</h2>
      <p>
        Our <a href="/legal/privacy">Privacy Policy</a> explains how we handle
        personal information and is incorporated into these Terms by reference.
        If these Terms conflict with the Privacy Policy concerning
        personal-information practices, the Privacy Policy controls to the
        extent of the conflict, unless applicable law requires otherwise.
      </p>

      <h2>14. Suspension and Termination</h2>
      <p>
        You may stop using the Services and close your account by contacting us
        at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may
        suspend or terminate access if you materially breach these Terms,
        create a security or legal risk, fail to pay, misuse the Services, or
        if continued service is unlawful. When reasonably practicable, we will
        provide notice and an opportunity to export User Content, unless
        prohibited by law or doing so would increase risk.
      </p>
      <p>
        Account closure and termination affect access but do not necessarily
        cause immediate deletion. The Privacy Policy and retention schedule
        govern deletion. Sections that by their nature should survive —
        including ownership, accrued payment obligations, disclaimers,
        limitations, indemnity, dispute provisions, and general terms — will
        survive termination.
      </p>

      <h2>15. Disclaimers</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICES ARE PROVIDED "AS
        IS" AND "AS AVAILABLE." SAFE LEGACY DISCLAIMS IMPLIED WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
        NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM COURSE OF DEALING OR
        USAGE. SAFE LEGACY DOES NOT WARRANT THAT THE SERVICES OR USER CONTENT
        WILL BE AVAILABLE, ACCURATE, COMPLETE, CURRENT, SECURE, ERROR-FREE,
        LEGALLY VALID, OR ACCEPTED BY ANY PERSON OR INSTITUTION.
      </p>
      <p>
        NO INFORMATION FROM SAFE LEGACY CREATES A WARRANTY OR PROFESSIONAL
        RELATIONSHIP. SOME RIGHTS CANNOT BE WAIVED; THESE DISCLAIMERS APPLY
        ONLY TO THE EXTENT PERMITTED BY LAW.
      </p>

      <h2>16. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SAFE LEGACY AND ITS
        AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND LICENSORS WILL
        NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
        CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE,
        GOODWILL, USE, OR DATA, ARISING OUT OF OR RELATING TO THE SERVICES OR
        THESE TERMS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL AGGREGATE
        LIABILITY OF SAFE LEGACY AND THE OTHER PARTIES IDENTIFIED ABOVE FOR ALL
        CLAIMS ARISING OUT OF OR RELATING TO THE SERVICES OR THESE TERMS WILL
        NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO SAFE LEGACY FOR
        THE SERVICES DURING THE 12 MONTHS IMMEDIATELY PRECEDING THE EVENT
        GIVING RISE TO THE CLAIM OR (B) $100.
      </p>
      <p>
        THESE LIMITATIONS DO NOT APPLY TO LIABILITY THAT CANNOT LAWFULLY BE
        EXCLUDED OR LIMITED, INCLUDING ANY RIGHTS OR REMEDIES THAT CANNOT BE
        WAIVED UNDER APPLICABLE CONSUMER-PROTECTION LAW. Nothing in these Terms
        is intended to exclude or limit liability to the extent such exclusion
        or limitation is prohibited by applicable law.
      </p>
      <p>
        The limitations in this Section reflect an allocation of risk between
        you and Safe Legacy and are an essential part of the agreement between
        us.
      </p>

      <h2>17. Indemnification</h2>
      <p>
        To the extent permitted by law, you will indemnify and hold harmless
        Safe Legacy and its affiliates, officers, directors, employees, and
        agents from third-party claims, losses, liabilities, and reasonable
        costs arising from your unlawful User Content, misuse of the Services,
        violation of another person's rights, or material breach of these
        Terms. This obligation does not apply to the extent a claim results
        from Safe Legacy's own unlawful conduct, negligence, or breach, or to
        the extent prohibited by law. Safe Legacy may control the defense and
        settlement, and you will reasonably cooperate.
      </p>

      <h2>18. Governing Law and Disputes</h2>
      <p>
        These Terms are governed by the laws of the State of New Jersey,
        without regard to its conflict-of-law principles.
      </p>
      <p>
        Before filing a lawsuit or other formal proceeding, you and Safe Legacy
        agree to provide the other party with written notice describing the
        dispute and the relief requested and to attempt in good faith to
        resolve the dispute for at least 30 days after the notice is received.
        Notices to Safe Legacy must be sent to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and to Wills
        Repository LLC, 35 Cedar Grove Road, Branchburg, New Jersey 08876.
      </p>
      <p>
        This informal dispute-resolution process does not prevent either party
        from seeking temporary or emergency relief when necessary or from
        taking action required to preserve a claim or comply with an applicable
        filing deadline.
      </p>
      <p>
        If the dispute is not resolved through this process, you and Safe
        Legacy consent to the exclusive jurisdiction of the state courts
        located in Somerset County, New Jersey, and the United States District
        Court for the District of New Jersey, except that either party may
        bring an eligible individual claim in small claims court.
      </p>
      <p>
        Nothing in this Section limits any right or remedy that cannot lawfully
        be waived under applicable consumer-protection law.
      </p>

      <h2>19. Changes to These Terms</h2>
      <p>
        We may update these Terms to reflect changes in the Services, law, or
        business practices. We will post the revised Terms and update the
        effective date. For material changes, we will provide reasonable
        advance notice and obtain renewed assent when required. Changes apply
        prospectively. If you do not agree, you must stop using the affected
        Services and cancel any subscription before the change takes effect.
      </p>

      <h2>20. General Terms</h2>
      <p>
        These Terms and incorporated policies are the entire agreement
        concerning the Services, except for any additional terms presented for
        a feature or purchase. If a provision is unenforceable, it will be
        modified to the minimum extent necessary and the remainder will remain
        effective. A waiver must be in writing and is not a continuing waiver.
        You may not assign these Terms without our consent; Safe Legacy may
        assign them in connection with a merger, reorganization, sale of
        assets, or by operation of law. Headings are for convenience only.
        Electronic notices and records satisfy writing requirements to the
        extent permitted by law.
      </p>

      <h2>21. Contact</h2>
      <p>
        Wills Repository, LLC, DBA Simply Safe Legacy, LLC
        <br />
        35 Cedar Grove Road
        <br />
        Branchburg, NJ 08876
        <br />
        County of Somerset, New Jersey
        <br />
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </LegalDocument>
  );
}

import { LegalDocument } from "@/components/layout/LegalLayout";

/**
 * Privacy Policy — /legal/privacy
 *
 * The text is transcribed from the New Jersey launch working draft. Two
 * placeholders from that draft are still unresolved and are rendered
 * visibly rather than filled in with a guess:
 *
 *   - the effective date (EFFECTIVE_DATE below)
 *   - the privacy contact address in section 11
 *
 * The draft's internal "Launch Completion Checklist" and "Drafting
 * References" are deliberately omitted: the draft marks them as internal
 * and to be removed from the public-facing version.
 *
 * When the text is revised materially, bump LegalDocumentVersion in
 * backend/internal/handlers/legal.go so consent rows record which revision
 * was accepted.
 */

const EFFECTIVE_DATE = "September 8, 2026";
const PRIVACY_EMAIL = "simplysafelegacy@gmail.com";

export default function PrivacyPolicy() {
  return (
    <LegalDocument title="Privacy Policy" effectiveDate={EFFECTIVE_DATE}>
      <p>
        This Privacy Policy explains how Wills Repository LLC, doing business
        as Simply Safe Legacy ("Safe Legacy," "Simply Safe Legacy," "we," "us,"
        or "our"), collects, uses, discloses, and protects personal information
        when you use the Safe Legacy mobile application, website, and related
        services (collectively, the "Services").
      </p>

      <h2>1. Scope and Who May Use the Services</h2>
      <p>
        The Services are currently offered only to residents of New Jersey who
        are at least 18 years old. This Policy applies to account holders,
        people invited as family members or delegates, prospective users, and
        visitors to our website. It does not apply to an independent attorney,
        financial professional, funeral provider, identity-verification
        provider, payment processor, or other third party acting under its own
        privacy policy.
      </p>
      <p>
        Safe Legacy is designed to store and share highly sensitive
        information. You should upload only information that is reasonably
        necessary for your estate, incapacity, emergency, or legacy planning
        and should not upload information about another person unless you have
        a lawful basis and appropriate permission to do so.
      </p>

      <h2>2. Personal Information We Collect</h2>

      <h3>A. Information you provide</h3>
      <ul>
        <li>
          Account and contact information, such as your name, email address,
          telephone number, mailing address, date of birth, username, and
          account credentials.
        </li>
        <li>
          Identity-verification information. Depending on the verification
          method selected for launch, this may include information from a
          government-issued identification document, a photograph or selfie,
          verification results, device information, and fraud-prevention
          signals.
        </li>
        <li>
          Vault content you choose to upload, enter, or store, which may
          include wills, trusts, powers of attorney, advance directives,
          insurance information, financial-account information, property
          records, funeral or memorial wishes, personal-property instructions,
          emergency information, professional contacts, beneficiary or family
          information, messages, photographs, images of documents, and other
          documents or instructions. For example, you may upload a picture or
          copy of your will. Uploaded vault content is stored using Amazon S3
          cloud storage.
        </li>
        <li>
          Family and delegate information, including names, contact details,
          relationships, invitations, permissions, access activity, and
          communications associated with access.
        </li>
        <li>
          Customer-support and communications information, including questions,
          feedback, complaints, survey responses, and records of communications
          with us.
        </li>
        <li>
          Transaction information associated with a paid tier, including
          subscription status, transaction identifiers, and limited billing
          details supplied by Stripe, our payment processor. We do not intend
          to store full payment-card numbers on Safe Legacy systems.
        </li>
      </ul>

      <h3>B. Information collected automatically</h3>
      <ul>
        <li>
          Device and technical information necessary to operate, secure, and
          support the Services, such as IP address, device type, operating
          system, app version, language, time zone, mobile carrier,
          identifiers, and network information.
        </li>
        <li>
          Usage and security information necessary to operate and protect the
          Services, such as login times, authentication events, vault actions,
          invitations, permission changes, document uploads or downloads,
          access logs, and suspected fraud or abuse.
        </li>
        <li>
          Essential cookie or similar-technology information used only for
          necessary functionality, session management, preferences, and
          security.
        </li>
      </ul>
      <p>
        We do not currently use analytics, crash-reporting, push-notification,
        or customer-support tracking tools for production telemetry.
      </p>

      <h3>C. Information from other people and providers</h3>
      <p>
        We may receive information from an account holder who invites you; from
        a family member or delegate who interacts with shared content; from
        identity-verification, payment, cloud-hosting, authentication,
        security, and fraud-prevention providers; and from an attorney or other
        professional only when you have authorized the connection or
        disclosure.
      </p>

      <h2>3. How We Use Personal Information</h2>
      <ul>
        <li>
          Provide, operate, maintain, personalize, and improve the Services.
        </li>
        <li>
          Create and administer accounts; authenticate users; verify identity;
          prevent unauthorized access; and maintain audit and access logs.
        </li>
        <li>
          Store, organize, retrieve, and display vault content at the user's
          direction.
        </li>
        <li>
          Send invitations and provide the permissions an account holder
          assigns to a family member or delegate.
        </li>
        <li>
          Process subscriptions and transactions, provide receipts, and manage
          upgrades, downgrades, cancellations, and account status.
        </li>
        <li>
          Send service, security, access, policy, and administrative
          communications.
        </li>
        <li>
          Provide support, troubleshoot errors, monitor performance, prevent
          fraud and misuse, enforce our Terms, and protect users, Safe Legacy,
          and others.
        </li>
        <li>
          Comply with law, lawful process, and valid requests; establish or
          defend legal claims; and respond to emergencies involving a risk of
          death or serious physical harm.
        </li>
        <li>
          Create aggregated or de-identified information that cannot reasonably
          be linked to an identified or identifiable person, subject to
          applicable law.
        </li>
      </ul>
      <p>
        We do not use the contents of your vault to advertise to you, build
        advertising profiles, determine eligibility for credit, insurance,
        employment, housing, or other essential services, or train a
        general-purpose artificial-intelligence model. We will not materially
        expand our use of vault content without updating this Policy and
        obtaining consent when required.
      </p>

      <h2>4. How We Disclose Personal Information</h2>
      <p>
        We may disclose personal information in the following circumstances:
      </p>
      <ul>
        <li>
          <strong>At your direction.</strong> We disclose vault content and
          related information to the family members, delegates, attorneys, or
          other people you select, within the permissions you configure.
        </li>
        <li>
          <strong>Service providers.</strong> We use providers for cloud
          hosting and storage, identity verification, payment processing,
          authentication, communications, customer support, analytics, fraud
          prevention, and security. They may process information only for
          contracted services and subject to appropriate obligations.
        </li>
        <li>
          <strong>Legal and safety purposes.</strong> We may disclose
          information when we reasonably believe disclosure is required by law
          or valid legal process, necessary to protect rights or safety, or
          appropriate to investigate fraud, abuse, or security incidents.
        </li>
        <li>
          <strong>Business transactions.</strong> Information may be
          transferred as part of a merger, financing, acquisition,
          reorganization, bankruptcy, or sale of assets, subject to applicable
          law and appropriate confidentiality protections.
        </li>
        <li>
          <strong>With consent.</strong> We may disclose information for
          another purpose that we explain when asking for your consent.
        </li>
      </ul>
      <p>
        Safe Legacy does not sell personal information for money and does not
        process personal information for targeted advertising. Safe Legacy does
        not share vault content with data brokers.
      </p>

      <h2>5. Family Members, Delegates, and Shared Access</h2>
      <p>
        An account holder may invite another person and grant that person
        access to selected sections or documents. The account holder is
        responsible for choosing recipients, confirming their contact
        information, selecting appropriate permissions, and keeping permissions
        current. An invited person must create or verify an account and agree
        to applicable terms before accessing content.
      </p>
      <p>
        A Safe Legacy permission controls access within the Services only. It
        does not create a power of attorney, agency, fiduciary relationship,
        beneficiary designation, executor appointment, health-care proxy, or
        other legal authority, and it does not establish that a document is
        valid, current, authentic, or legally operative. Removing access in
        Safe Legacy does not revoke authority granted in a separate legal
        instrument.
      </p>
      <p>
        We may record and display access events to the account holder and other
        authorized users. Once information has been viewed, downloaded,
        printed, copied, or separately stored by an authorized recipient, Safe
        Legacy may not be able to retrieve or delete every copy.
      </p>

      <h2>6. Sensitive Information and Consent</h2>
      <p>
        Vault content may include information treated as sensitive under
        applicable law. We process sensitive information only as reasonably
        necessary to provide the Services, protect accounts, comply with law,
        or for another purpose disclosed to you. We do not currently use a
        separate in-product sensitive-data consent flow or in-product
        identity-verification disclosure before collection.
      </p>

      <h2>7. Privacy Choices and New Jersey Rights</h2>
      <p>
        You can review and update certain account information through your
        account settings. You can also view and delete content that you have
        uploaded to the Services.
      </p>
      <p>
        You may request that we delete your account or make another
        privacy-related request by contacting us at{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. If you cannot
        access your account, you may use the same email address to contact us.
      </p>
      <p>
        Depending on applicable law, you may have rights regarding your
        personal information, including the right to:
      </p>
      <ul>
        <li>
          confirm whether we process your personal information and request
          access to it;
        </li>
        <li>correct inaccurate personal information;</li>
        <li>request deletion of personal information;</li>
        <li>
          obtain a portable copy of certain personal information; and
        </li>
        <li>
          appeal certain decisions we make regarding a privacy request.
        </li>
      </ul>
      <p>
        Safe Legacy does not sell personal information, use personal
        information for targeted advertising, or use personal information for
        profiling in furtherance of decisions that produce legal or similarly
        significant effects.
      </p>
      <p>
        We may take reasonable steps to verify your identity or authority
        before completing a request. For example, we may ask you to verify
        access to the email address associated with your account or provide
        other information reasonably necessary to verify the request.
      </p>
      <p>
        If applicable law gives you the right to appeal a decision concerning a
        privacy request, you may submit the appeal by emailing{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> and identifying
        the request you would like us to reconsider. We will respond to privacy
        requests and appeals within the time required by applicable law.
      </p>
      <p>
        Where we rely on your consent to process personal information and
        applicable law gives you the right to withdraw that consent, you may
        contact us at{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> to make that
        request.
      </p>

      <h2>8. Retention and Account Closure</h2>
      <p>
        We retain personal information for as long as reasonably necessary to
        provide the Services, maintain the security and integrity of the
        Services, comply with legal obligations, resolve disputes, and enforce
        our agreements.
      </p>
      <p>
        Information associated with an active account, including content stored
        in a user's vault, is generally retained for as long as the account
        remains active or until the user deletes the information.
      </p>
      <p>
        Users may delete uploaded content through the Services. Users may
        request deletion of their account by contacting us at{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. When an
        account is deleted, we will delete or de-identify personal information
        associated with the account within a reasonable period, except where
        retention is necessary for legal, security, fraud-prevention, backup,
        dispute-resolution, or other legitimate purposes permitted by law.
      </p>
      <p>
        Deleted information may remain temporarily in encrypted or otherwise
        protected backups until those backups are overwritten or expire in the
        ordinary course of our backup process. Information that an authorized
        family member, delegate, or other recipient previously downloaded,
        copied, printed, or separately stored is outside our control and may
        not be deleted when the account holder deletes the original content or
        closes the account.
      </p>
      <p>
        When personal information is no longer retained, we take reasonable
        steps to securely delete or render it unreadable in accordance with
        applicable law.
      </p>

      <h2>9. Security</h2>
      <p>
        We use reasonable administrative and technical safeguards designed to
        protect personal information against unauthorized access, use,
        alteration, or disclosure. These safeguards may include access
        controls, security logging, and security features provided by our cloud
        and service providers.
      </p>
      <p>
        We limit access to personal information to those who reasonably need
        access to operate, maintain, secure, or support the Services.
      </p>
      <p>
        No method of transmission over the Internet or method of electronic
        storage can be guaranteed to be completely secure. Accordingly, we
        cannot guarantee the absolute security of personal information.
      </p>
      <p>
        You are responsible for maintaining the confidentiality of your account
        credentials and for promptly notifying us if you believe your account
        or information has been accessed without authorization.
      </p>

      <h2>10. Death, Incapacity, and Requests Concerning Another Person</h2>
      <p>
        Safe Legacy will not provide access to an account or its contents
        solely because a person claims to be a relative, beneficiary, executor,
        administrator, trustee, guardian, agent, attorney, or other
        representative of an account holder.
      </p>
      <p>
        If an account holder is deceased or incapacitated, we require the
        requester to provide information and documentation sufficient to
        establish the requester's identity, the identity of the account holder,
        and the requester's legal authority to act on the account holder's
        behalf.
      </p>
      <p>
        Depending on the circumstances, documentation may include a death
        certificate, letters testamentary or other evidence of appointment as a
        personal representative, a court order, power of attorney, trust
        documentation, or other evidence of legal authority.
      </p>
      <p>
        Requests involving a deceased or incapacitated account holder are
        subject to manual review by authorized Safe Legacy personnel. We may
        request additional information or documentation, require certified or
        otherwise verifiable records where appropriate, or obtain legal review
        before granting access or disclosing information.
      </p>
      <p>
        If we determine that the requester has established the necessary
        authority, we will provide access to or disclosure of information only
        to the extent permitted by applicable law, the account holder's
        instructions, and the requester's demonstrated authority.
      </p>
      <p>
        Safe Legacy does not determine the validity of wills, powers of
        attorney, trusts, fiduciary appointments, or competing claims to an
        estate. If authority is disputed, documents conflict, or the
        appropriate course of action is unclear, we may require the parties to
        resolve the matter through the appropriate legal process before
        providing access or disclosing information.
      </p>

      <h2>11. Children</h2>
      <p>
        The Services are not directed to, and may not be used by, anyone under
        18. We do not knowingly collect personal information directly from a
        child through a child account. Adults should avoid uploading a child's
        personal information unless reasonably necessary and legally permitted.
        If you believe a child has created an account or provided information
        directly, contact us at{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
      </p>

      <h2>12. Third-Party Services and Links</h2>
      <p>
        The Services may link to or integrate with third-party services. Their
        privacy practices are governed by their own notices. Safe Legacy is not
        responsible for a third party's independent practices. Before using an
        integration, review the third party's terms and privacy notice.
      </p>

      <h2>13. Changes to This Policy</h2>
      <p>
        We may update this Policy to reflect changes to the Services, law, or
        our practices. We will post the updated version and revise the
        effective date. If changes are material, we will provide additional
        notice and seek consent when required. Continued use after an update
        takes effect is subject to applicable law and does not substitute for
        consent when consent is required.
      </p>

      <h2>14. Contact Us</h2>
      <p>Privacy questions or requests may be directed to:</p>
      <p>
        Wills Repository, LLC, DBA Simply Safe Legacy, LLC
        <br />
        35 Cedar Grove Road
        <br />
        Branchburg, NJ 08876
        <br />
        County of Somerset, New Jersey
        <br />
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
      </p>
    </LegalDocument>
  );
}

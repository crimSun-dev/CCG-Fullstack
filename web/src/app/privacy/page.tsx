import type { Metadata } from "next";
import { PageFrame } from "@/components/ConstructionField";

export const metadata: Metadata = { title: "Privacy" };

// Plain statement of what the form stores. Legal wording is for counsel to add later (TDD Phase 4, item 5).
export default function PrivacyPage() {
  return (
    <PageFrame>
      <h1 className="page__title">Privacy</h1>
      <div className="page__body prose">
        <p>When you send an enquiry through the contact form, CK Coaching Group stores:</p>
        <ul>
          <li>your name and email address;</li>
          <li>your phone number and organization, if you give them;</li>
          <li>the program you are interested in, and your message;</li>
          <li>the time you gave consent by ticking the consent box.</li>
        </ul>
        <p>
          We use these details only to reply to your enquiry. An enquiry is not stored unless you consent. We do not
          store your IP address; a one-way hash of it is kept to limit repeated submissions.
        </p>
        <p>This site does not take payments.</p>
      </div>
    </PageFrame>
  );
}

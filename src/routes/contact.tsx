import { createFileRoute } from '@tanstack/react-router';
import { ApplicationForm, Callout, Hero, Section } from '@/components/iff';
import { topics } from '@/lib/submissions';
import { pageHead } from '@/lib/site';

export const Route = createFileRoute('/contact')({
  head: () => pageHead(
    'Contact & Partnerships',
    'Start a membership, institutional partnership or executive dialogue with the Indian Financial Forum.',
  ),
  validateSearch: (search: Record<string, unknown>): { topic?: typeof topics[number] } => {
    const topic = topics.find(item => item === search['topic']);
    return topic ? { topic } : {};
  },
  component: Contact,
});

function Contact() {
  const { topic } = Route.useSearch();

  return (
    <>
      <Hero
        eyebrow="PARTNERSHIP & INQUIRIES"
        title={<>Let’s start something<br /><em>meaningful.</em></>}
        description="Whether you want to join the IFF ecosystem, explore an enterprise partnership, or collaborate with the BFSI community, tell us about yourself and we’ll connect you with the right team."
        action=""
      />
      <Section id="contact-form">
        <div className="section-heading centered">
          <h2>Get In Touch With Us</h2>
          <p>Fill in the details below to initiate an executive consultation or partnership dialogue.</p>
        </div>
        <div className="form-width">
          <ApplicationForm key={topic} topic={topic} />
        </div>
      </Section>
      <Callout title="Join the IFF community" />
    </>
  );
}

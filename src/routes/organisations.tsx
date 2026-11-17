import { useCms, usePagePhoto } from '@/lib/cms-context';
import { createFileRoute } from '@tanstack/react-router';
import { Download, Handshake, Users, MessagesSquare, Lightbulb, Network, Megaphone, Target, TrendingUp, BookOpen } from 'lucide-react';
import { Action, Eyebrow, FeatureGrid, Section } from '@/components/iff';
import { Button } from '@/components/ui/button';
import { pageHead } from '@/lib/site';

export const Route = createFileRoute('/organisations')({
  head: () => pageHead('For Organisations', 'Partner with IFF to engage decision-makers, build brand credibility and create meaningful connections across the BFSI ecosystem.'),
  component: Organisations,
});

function Organisations() {
  const { branding } = useCms();
  const hero = usePagePhoto('hero');
  const partnership = usePagePhoto('partnership');
  const footer = usePagePhoto('footer');
  return <div className="organisations-page">
    <section className="org-hero">
      <img className="org-hero-image" src={hero.src} alt={hero.alt} fetchPriority="high" />
      <div className="container org-hero-inner">
        <div className="hero-copy">
          <h1>For Organisations</h1>
          <p>Partner With Us to build credibility, engage decision-makers and create meaningful connections across the financial ecosystem.</p>
          <div className="hero-buttons"><Action topic="Institutional Partnership">Partner With Us</Action></div>
        </div>
      </div>
    </section>

    <Section id="partnerships" eyebrow="How we can work together" title="There’s more than one way to make an impact." description="From focused leadership conversations to wider community engagement, we create partnership opportunities around what your organisation wants to achieve.">
      <FeatureGrid items={[
        { title: 'Strategic Partnerships', text: 'Build long-term associations around shared industry priorities.', icon: Handshake },
        { title: 'Sponsorship Opportunities', text: 'Put your brand alongside relevant conversations, communities and experiences.', icon: Users },
        { title: 'Executive Roundtables', text: 'Engage senior decision-makers through focused, high-value discussions.', icon: MessagesSquare },
        { title: 'Thought Leadership', text: 'Bring your expertise and point of view into conversations that matter to BFSI.', icon: Lightbulb },
        { title: 'Community Engagement', text: 'Connect meaningfully with professionals across sectors, interests and markets.', icon: Network },
        { title: 'Brand Collaborations', text: 'Create relevant campaigns, experiences and initiatives with the IFF ecosystem.', icon: Megaphone },
      ]} />
      <div className="section-end"><Action secondary>Explore Partnership Opportunities</Action></div>
    </Section>

    <section className="conversation-band org-editorial">
      <div className="container">
        <img src={partnership.src} alt={partnership.alt} loading="lazy" />
        <div>
          <Eyebrow>Partnerships that matter</Eyebrow>
          <h2>The right partnership puts your brand in the right room.</h2>
          <p>With the right people. Around the right conversation. At the right time.</p>
        </div>
      </div>
    </section>

    <Section eyebrow="Why partner with IFF" title="Be visible where the right conversations are happening." description="IFF brings together professionals, leaders and organisations from across BFSI, creating opportunities for brands to participate with relevance and purpose.">
      <FeatureGrid items={[
        { title: 'Reach the Right Audience', text: 'Connect with a curated community of BFSI professionals.', icon: Target },
        { title: 'Meet Industry Leaders', text: 'Create opportunities to engage senior voices and decision-makers.', icon: Users },
        { title: 'Build Brand Credibility', text: 'Strengthen visibility in an environment built around industry relevance.', icon: TrendingUp },
        { title: 'Shape Better Conversations', text: 'Co-create discussions around the issues, ideas and opportunities affecting BFSI.', icon: MessagesSquare },
        { title: 'Back Knowledge-Led Initiatives', text: 'Support platforms designed for learning, insight and professional exchange.', icon: BookOpen },
        { title: 'Build Stronger Relationships', text: 'Create deeper connections across the wider financial ecosystem.', icon: Network },
      ]} />
      {branding.brochure && <div className="section-end"><Button asChild size="lg" variant="outline"><a href={branding.brochure}><Download />Download Partnership Brochure</a></Button></div>}
    </Section>

    <section className="section org-final" id="join">
      <img src={footer.src} alt={footer.alt} loading="lazy" />
      <div className="container">
        <h2>Create meaningful industry impact.</h2>
        <p>Whether you want to partner, sponsor, collaborate or engage the ecosystem, we can shape an opportunity around what you are trying to achieve.</p>
        <Action topic="Institutional Partnership">Partner With IFF</Action>
      </div>
    </section>
  </div>;
}
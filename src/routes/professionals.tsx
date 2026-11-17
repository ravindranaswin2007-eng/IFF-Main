import { usePagePhoto } from '@/lib/cms-context';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { BrainCircuit, TrendingUp, ShieldCheck, Coins, ChartNoAxesCombined, CreditCard, LockKeyhole, Users, BookOpen, MessageCircle, CalendarDays, Megaphone } from 'lucide-react';
import { Action, FeatureGrid, Section } from '@/components/iff';
import { Button } from '@/components/ui/button';
import { pageHead } from '@/lib/site';

export const Route = createFileRoute('/professionals')({
  head: () => pageHead('For Professionals', 'Join a thriving network of BFSI professionals through industry-focused communities, exclusive member benefits and opportunities to connect, learn and collaborate.'),
  component: Professionals,
});

const communities = [
  { title: 'Sectoral Chapters', description: 'Stay close to the conversations shaping your part of the industry.', items: [
    { name: 'AI in Banking', icon: BrainCircuit }, { name: 'FinTech', icon: TrendingUp },
    { name: 'Insurance', icon: ShieldCheck }, { name: 'Wealthtech', icon: Coins },
    { name: 'Risk & Analytics', icon: ChartNoAxesCombined }, { name: 'Payments & Lending', icon: CreditCard },
    { name: 'Data Privacy & Security', icon: LockKeyhole },
  ] },
  { title: 'City Chapters', description: 'Build stronger professional connections closer to where you are.', items: ['Delhi NCR', 'Chandigarh', 'Chennai', 'Jaipur', 'Mumbai', 'Pune', 'Hyderabad', 'Bengaluru', 'Dubai'].map(name => ({ name, icon: Users })) },
  { title: 'Interest-Based Communities', description: 'Go deeper into the ideas and themes you care about.', items: ['Co-lending', 'Drone', 'Healthcare Financing', 'AI Community', 'Green Financing', 'DPI Group'].map(name => ({ name, icon: BookOpen })) },
];

function Professionals() {
  const hero = usePagePhoto('hero');
  const footer = usePagePhoto('footer');
  const [selected, setSelected] = useState(0);
  const current = communities[selected] ?? communities[0];
  if (!current) return null;
  return <div className="professionals-page">
    <section className="org-hero">
      <img className="org-hero-image" src={hero.src} alt={hero.alt} fetchPriority="high" />
      <div className="container org-hero-inner"><div className="hero-copy">
        <h1>For Professionals</h1>
        <p>Join a thriving network of BFSI professionals through industry-focused communities, exclusive member benefits and opportunities to connect, learn and collaborate.</p>
        <div className="hero-buttons"><Action topic="Membership">Become a Member</Action></div>
      </div></div>
    </section>

    <Section blue id="community" eyebrow="Your IFF network" title="Choose Your Community">
      <div className="professional-community-intro"><h3>Find your people. Grow your network.</h3><p>Explore communities designed around your industry and professional interests.</p></div>
      <div className="professional-tabs" role="tablist" aria-label="Community types">
        {communities.map((community, index) => <Button key={community.title} id={`community-tab-${index}`} role="tab" aria-selected={selected === index} aria-controls="community-panel" tabIndex={selected === index ? 0 : -1} variant="ghost" className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)} onKeyDown={event => {
          let next = index;
          if (event.key === 'ArrowRight') next = (index + 1) % communities.length;
          else if (event.key === 'ArrowLeft') next = (index + communities.length - 1) % communities.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = communities.length - 1;
          else return;
          event.preventDefault(); setSelected(next); document.getElementById(`community-tab-${next}`)?.focus();
        }}>{community.title}</Button>)}
      </div>
      <div id="community-panel" className="professional-community-panel" role="tabpanel" aria-labelledby={`community-tab-${selected}`} tabIndex={0}>
        <h3>{current.title}</h3><p>{current.description}</p>
        <div className="professional-community-grid">{current.items.map(item => { const Icon = item.icon; return <article key={item.name}><Icon size={30} aria-hidden="true" /><h4>{item.name}</h4></article>; })}</div>
        <div className="section-end"><Action secondary>Explore All Communities</Action></div>
      </div>
    </Section>

    <Section id="benefits" eyebrow="Being part of IFF" title="Membership Benefits" description="Make the most of your IFF membership through access, insights and opportunities to collaborate.">
      <FeatureGrid items={[
        { title: 'Join exclusive WhatsApp communities', text: 'Join exclusive WhatsApp communities', icon: MessageCircle },
        { title: 'Access curated industry events', text: 'Access curated industry events', icon: CalendarDays },
        { title: 'Connect with peers and industry leaders', text: 'Connect with peers and industry leaders', icon: Users },
        { title: 'Receive member-only insights & editorial', text: 'Receive member-only insights & editorial', icon: BookOpen },
        { title: 'Participate in knowledge-sharing initiatives', text: 'Participate in knowledge-sharing initiatives', icon: BrainCircuit },
        { title: 'Discover speaking and collaboration opportunities', text: 'Discover speaking and collaboration opportunities', icon: Megaphone },
      ]} />
      <div className="section-end"><Action topic="Membership">Become a Member</Action></div>
    </Section>

    <section className="section org-final" id="join">
      <img src={footer.src} alt={footer.alt} loading="lazy" />
      <div className="container"><h2>Be Part of the Conversations Shaping BFSI</h2><p>Join a growing community of professionals committed to learning, collaboration and industry impact.</p>
        <div className="hero-buttons"><Action topic="Membership">Become a Member</Action><Action secondary>Contact Us</Action></div>
      </div>
    </section>
  </div>;
}

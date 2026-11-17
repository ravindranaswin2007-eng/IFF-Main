import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Callout, Hero, Section } from '@/components/iff';
import { PublicationCards } from '@/components/publication-cards';
import { listPublications } from '@/lib/publications';
import { publicationTypes } from '@/lib/submissions';
import { pageHead } from '@/lib/site';

export const Route = createFileRoute('/knowledge-hub')({
  head: () => pageHead('Knowledge Hub', 'Blogs, reports, podcasts and webinars from the Indian Financial Forum.'),
  loader: () => listPublications(),
  component: Knowledge,
});

const filters = ['All', ...publicationTypes] as const;

function Knowledge() {
  const publications = Route.useLoaderData();
  const [filter, setFilter] = useState<typeof filters[number]>('All');
  const entries = filter === 'All' ? publications : publications.filter(post => post.type === filter);

  return <>
    <Hero eyebrow="KNOWLEDGE HUB" action="" title={<>Ideas and insights from the <em>BFSI</em> community.</>}
      description="Explore blogs, reports, podcasts and webinars from India’s financial community." />
    <Section title="Publications">
      <div className="filter-tabs" role="group" aria-label="Publication types">
        {filters.map(value => <button key={value} type="button" aria-pressed={filter === value}
          onClick={() => setFilter(value)}>{value === 'All' ? 'All' : `${value}s`}</button>)}
      </div>
      <PublicationCards entries={entries} />
    </Section>
    <Callout title="Bring your perspective to the conversation."
      text="Share your expertise with the IFF community." action="Contribute Your Expertise" to="/speaking" />
  </>;
}

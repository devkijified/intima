// Deterministic mock reviews for preview providers.
// Real providers load from the public.reviews table.

export interface MockReview {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

const REVIEW_POOL: Array<{ rating: number; comment: string }> = [
  { rating: 5, comment: 'Exactly as described. Great conversation, very professional.' },
  { rating: 5, comment: 'Stunning in person. Will definitely book again.' },
  { rating: 4, comment: 'Good experience overall. Communication could be faster.' },
  { rating: 5, comment: 'Made me feel comfortable immediately. Highly recommended.' },
  { rating: 5, comment: 'Beautiful, punctual, and genuine. Worth every naira.' },
  { rating: 4, comment: 'Nice time. She was a bit late but made up for it.' },
  { rating: 5, comment: 'The photos do not do her justice. Amazing evening.' },
  { rating: 3, comment: 'Okay experience. Not quite what I expected from the profile.' },
  { rating: 5, comment: 'Intelligent, funny, gorgeous. A rare combination.' },
  { rating: 4, comment: 'Solid. Would book again for dinner dates.' },
];

const AUTHORS = [
  'Tunde A.', 'Chidi O.', 'Ibrahim M.', 'Seun B.', 'Emeka N.',
  'Wale F.', 'Dami L.', 'Kunle S.', 'Tobi R.', 'Yemi J.',
];

/** Deterministic mock reviews for a provider, based on her id. */
export function getMockReviews(providerId: string, count: number): MockReview[] {
  let h = 0;
  for (let i = 0; i < providerId.length; i++) h = (h * 31 + providerId.charCodeAt(i)) % 997;
  const reviews: MockReview[] = [];
  const n = Math.min(count, 5);
  for (let i = 0; i < n; i++) {
    const pick = REVIEW_POOL[(h + i * 7) % REVIEW_POOL.length];
    const author = AUTHORS[(h + i * 3) % AUTHORS.length];
    const daysAgo = 2 + ((h + i * 11) % 60);
    reviews.push({
      id: `${providerId}-rev-${i}`,
      author,
      rating: pick.rating,
      comment: pick.comment,
      date: `${daysAgo}d ago`,
    });
  }
  // Sort by rating desc so the best show first.
  return reviews.sort((a, b) => b.rating - a.rating);
}

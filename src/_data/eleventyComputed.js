export default {
  pageTitle: (data) => data.page?.url === "/" ? `${data.profile.name} · Academic Homepage` : `${data.title} · ${data.profile.name}`,
  canonical: (data) => new URL(data.page?.url || "/", data.site.url).href,
  schema: (data) => ({
    "@context": "https://schema.org",
    "@type": data.page?.url === "/" ? "ProfilePage" : "WebPage",
    name: data.title,
    url: new URL(data.page?.url || "/", data.site.url).href,
    description: data.description || data.site.description,
    ...(data.page?.url === "/" ? { mainEntity: {
      "@type": "Person", name: data.profile.name, alternateName: data.profile.chineseName,
      image: new URL(data.profile.portrait, data.site.url).href,
      url: data.site.url, sameAs: [data.profile.github, data.profile.scholar].filter(Boolean),
      affiliation: { "@type": "CollegeOrUniversity", name: data.profile.institution },
      knowsAbout: data.profile.interests
    } } : {})
  })
};

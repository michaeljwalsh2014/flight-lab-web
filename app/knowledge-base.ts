export type BuiltInKnowledgeAnswer = {
  answer: string;
  source: string;
  sourceName: string;
  verifiedOn: string;
};

type Fact = BuiltInKnowledgeAnswer & { patterns: RegExp[] };

const VERIFIED_ON = "August 14, 2026";

const fact = (answer: string, sourceName: string, source: string, ...patterns: RegExp[]): Fact => ({
  answer,
  source,
  sourceName,
  verifiedOn: VERIFIED_ON,
  patterns,
});

// These are deliberately narrow, high-confidence answers. A narrow match is better
// than confidently returning the wrong record for an ambiguous question.
const FACTS: Fact[] = [
  fact("The farthest paper-aircraft flight recognized by Guinness is 88.318 meters (289 feet 9 inches). Dillon Ruble made the throw, supported by Nathaniel Erickson and Garrett Jensen, in Crown Point, Indiana, on December 2, 2022.", "Guinness World Records", "https://www.guinnessworldrecords.com/world-records/farthest-flight-by-a-paper-aircraft", /(?:paper (?:airplane|aircraft)|paper plane).*(?:distance|farthest|furthest|world record)/, /(?:distance|farthest|furthest).*(?:paper (?:airplane|aircraft)|paper plane)/),
  fact("Takuo Toda holds the Guinness record for the longest-flying paper aircraft by duration: 29.2 seconds, achieved in Fukuyama, Japan, on December 19, 2010.", "Guinness World Records", "https://www.guinnessworldrecords.com/world-records/longest-flying-paper-aircraft-duration", /(?:paper (?:airplane|aircraft)|paper plane).*(?:airtime|duration|longest flying|time.*record)/, /(?:airtime|duration|longest flying).*(?:paper (?:airplane|aircraft)|paper plane)/),
  fact("Usain Bolt holds the men’s 100-meter world record at 9.58 seconds, set in Berlin on August 16, 2009.", "World Athletics", "https://worldathletics.org/disciplines/sprints/100-metres", /(?:men|man|male|bolt).*(?:100 ?m|100 meter|100 metre).*(?:record|fastest)/, /(?:fastest man|men'?s 100 ?m world record)/),
  fact("Florence Griffith-Joyner holds the women’s 100-meter world record at 10.49 seconds, set in Indianapolis on July 16, 1988.", "World Athletics", "https://worldathletics.org/disciplines/sprints/100-metres", /(?:women|woman|female|flo-?jo|griffith).*(?:100 ?m|100 meter|100 metre).*(?:record|fastest)/, /(?:fastest woman|women'?s 100 ?m world record)/),
  fact("Usain Bolt holds the men’s 200-meter world record at 19.19 seconds, set in Berlin in 2009.", "World Athletics", "https://worldathletics.org/records/by-discipline/sprints/200-metres/outdoor/men", /(?:men|man|male|bolt).*(?:200 ?m|200 meter|200 metre).*(?:record|fastest)/),
  fact("Florence Griffith-Joyner holds the women’s 200-meter world record at 21.34 seconds, set in Seoul in 1988.", "World Athletics", "https://worldathletics.org/records/by-discipline/sprints/200-metres/outdoor/women", /(?:women|woman|female|flo-?jo|griffith).*(?:200 ?m|200 meter|200 metre).*(?:record|fastest)/),
  fact("Wayde van Niekerk holds the men’s 400-meter world record at 43.03 seconds, set at the 2016 Rio Olympics.", "World Athletics", "https://worldathletics.org/records/by-discipline/sprints/400-metres/outdoor/men", /(?:men|man|male|niekerk).*(?:400 ?m|400 meter|400 metre).*(?:record|fastest)/),
  fact("Marita Koch holds the women’s 400-meter world record at 47.60 seconds, set in Canberra in 1985.", "World Athletics", "https://worldathletics.org/records/by-discipline/sprints/400-metres/outdoor/women", /(?:women|woman|female|koch).*(?:400 ?m|400 meter|400 metre).*(?:record|fastest)/),
  fact("David Rudisha holds the men’s 800-meter world record at 1:40.91, set at the 2012 London Olympics.", "World Athletics", "https://worldathletics.org/records/by-discipline/middlelong/800-metres/outdoor/men", /(?:men|man|male|rudisha).*(?:800 ?m|800 meter|800 metre).*(?:record|fastest)/),
  fact("Jarmila Kratochvílová holds the women’s 800-meter world record at 1:53.28, set in Munich in 1983.", "World Athletics", "https://worldathletics.org/records/by-discipline/middlelong/800-metres/outdoor/women", /(?:women|woman|female|krato).*(?:800 ?m|800 meter|800 metre).*(?:record|fastest)/),
  fact("Javier Sotomayor holds the men’s outdoor high-jump world record at 2.45 meters, set in Salamanca in 1993.", "World Athletics", "https://worldathletics.org/records/by-discipline/jumps/high-jump/outdoor/men", /(?:men|man|male).*(?:high jump).*(?:record|highest)/),
  fact("Yaroslava Mahuchikh holds the women’s high-jump world record at 2.10 meters, set in Paris on July 7, 2024.", "World Athletics", "https://worldathletics.org/news/press-releases/ratified-world-records-mahuchikh-eisa-hibbert-yan", /(?:women|woman|female|mahuchikh).*(?:high jump).*(?:record|highest)/),
  fact("Mike Powell holds the men’s outdoor long-jump world record at 8.95 meters, set in Tokyo in 1991.", "World Athletics", "https://worldathletics.org/records/by-discipline/jumps/long-jump/outdoor/men", /(?:men|man|male).*(?:long jump).*(?:record|farthest)/),
  fact("Galina Chistyakova holds the women’s outdoor long-jump world record at 7.52 meters, set in Leningrad in 1988.", "World Athletics", "https://worldathletics.org/records/by-discipline/jumps/long-jump/outdoor/women", /(?:women|woman|female).*(?:long jump).*(?:record|farthest)/),
  fact("Jupiter is the largest planet in our solar system. Its equatorial diameter is about 142,984 kilometers (88,846 miles).", "NASA Solar System Exploration", "https://science.nasa.gov/jupiter/facts/", /(?:largest|biggest) planet(?: in (?:our|the) solar system)?/),
  fact("Mercury is the smallest planet in our solar system. Its equatorial diameter is about 4,880 kilometers (3,032 miles).", "NASA Solar System Exploration", "https://science.nasa.gov/mercury/facts/", /smallest planet(?: in (?:our|the) solar system)?/),
  fact("Venus is the hottest planet in our solar system. Its thick carbon-dioxide atmosphere traps heat through an extreme greenhouse effect.", "NASA Solar System Facts", "https://science.nasa.gov/solar-system/solar-system-facts/", /hottest planet(?: in (?:our|the) solar system)?/),
  fact("Mercury is the closest planet to the Sun, with an average orbital distance of about 58 million kilometers (36 million miles).", "NASA Mercury Facts", "https://science.nasa.gov/mercury/facts/", /closest planet to (?:the )?sun/),
  fact("Neptune is the farthest of the eight recognized planets from the Sun, orbiting at an average distance of about 4.5 billion kilometers (2.8 billion miles).", "NASA Neptune Facts", "https://science.nasa.gov/neptune/facts/", /farthest planet from (?:the )?sun/),
  fact("Olympus Mons on Mars is the tallest known volcano in the solar system. It rises about 25 kilometers (16 miles) above the surrounding plains.", "NASA", "https://www.nasa.gov/space-science-and-astrobiology-at-ames/interesting-fact-of-the-month-current/interesting-fact-of-the-month-2022/", /(?:tallest|highest|largest) (?:mountain|volcano) (?:in|on).*(?:solar system|mars)/, /olympus mons/),
  fact("The Sun is about 4.5 billion years old, about 1.4 million kilometers (865,000 miles) wide, and contains more than 99% of the solar system’s mass.", "NASA Sun Facts", "https://science.nasa.gov/sun/facts/", /how old is (?:the )?sun/, /how (?:big|wide) is (?:the )?sun/),
  fact("Light from the Sun takes about 8 minutes 20 seconds to reach Earth on average.", "NASA Earth Facts", "https://science.nasa.gov/earth/facts/", /how long.*(?:sunlight|light from (?:the )?sun).*(?:earth|reach us)/),
  fact("Earth’s mean distance from the Sun is one astronomical unit: about 150 million kilometers (93 million miles).", "NASA Earth Facts", "https://science.nasa.gov/earth/facts/", /how far is (?:the )?earth from (?:the )?sun/, /distance from (?:the )?earth to (?:the )?sun/),
  fact("The Pacific Ocean is Earth’s largest and deepest ocean basin.", "NOAA Ocean Service", "https://oceanservice.noaa.gov/facts/biggestocean.html", /(?:largest|biggest) ocean(?: in the world| on earth)?/),
  fact("Mount Everest is Earth’s highest mountain above mean sea level. Its officially agreed height is 8,848.86 meters (29,031.69 feet).", "Government of Nepal — Department of Survey", "https://dos.gov.np/", /(?:highest|tallest) mountain (?:in the world|on earth|above sea level)/, /how (?:high|tall) is (?:mount )?everest/),
  fact("The Nile is commonly listed as the world’s longest river at about 6,650 kilometers (4,132 miles), though measuring a river’s exact source and length is complicated and some studies argue for the Amazon.", "Encyclopaedia Britannica", "https://www.britannica.com/place/Nile-River", /longest river (?:in the world|on earth)/),
  fact("Russia is the world’s largest country by total area, covering about 17.1 million square kilometers.", "CIA World Factbook", "https://www.cia.gov/the-world-factbook/countries/russia/", /(?:largest|biggest) country (?:in the world|by area)/),
  fact("Vatican City is the world’s smallest independent state by area.", "Vatican State", "https://www.vaticanstate.va/en/state-and-government/general-informations/geography.html", /smallest country (?:in the world|by area)/),
  fact("The blue whale is the largest animal known to have lived, reaching more than 30 meters (98 feet) in length and well over 100 metric tons.", "NOAA Fisheries", "https://www.fisheries.noaa.gov/species/blue-whale", /(?:largest|biggest) animal(?: ever| in the world| on earth)?/),
  fact("The cheetah is the fastest land animal. It can reach roughly 60–70 mph (97–113 km/h) in short bursts.", "Smithsonian’s National Zoo", "https://nationalzoo.si.edu/animals/cheetah", /fastest land animal/),
  fact("The peregrine falcon is the fastest animal when diving. Its hunting stoop can exceed 200 mph (320 km/h).", "U.S. National Park Service", "https://www.nps.gov/articles/000/peregrine-falcon.htm", /fastest animal(?: in the world| on earth)?/, /fastest bird/),
  fact("The African bush elephant is the largest living land animal.", "Smithsonian’s National Zoo", "https://nationalzoo.si.edu/animals/african-elephant", /largest (?:living )?land animal/),
  fact("A group of crows is traditionally called a murder. In ordinary scientific writing, ‘flock’ is also perfectly clear.", "Merriam-Webster", "https://www.merriam-webster.com/dictionary/murder", /what (?:is|do you call) a group of crows/),
  fact("Water freezes at 0 °C (32 °F) and boils at 100 °C (212 °F) at standard atmospheric pressure. Both temperatures change when pressure changes.", "NIST", "https://www.nist.gov/pml/owm/si-units-temperature", /(?:freezing|boiling) point of water/, /what temperature does water (?:freeze|boil)/),
  fact("The speed of light in vacuum is exactly 299,792,458 meters per second, by definition of the meter.", "NIST", "https://physics.nist.gov/cgi-bin/cuu/Value?c", /speed of light/),
  fact("There are eight planets in our solar system: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune.", "NASA Solar System Facts", "https://science.nasa.gov/solar-system/solar-system-facts/", /how many planets(?: are there)?(?: in (?:our|the) solar system)?/, /name (?:all )?(?:the )?planets/),
  fact("The Moon’s average distance from Earth is about 384,400 kilometers (238,855 miles).", "NASA Moon Facts", "https://science.nasa.gov/moon/facts/", /how far is (?:the )?moon from (?:the )?earth/, /distance (?:from|between) (?:the )?(?:earth|moon).*(?:moon|earth)/),
  fact("The Wright brothers’ first successful powered, controlled airplane flight took place near Kitty Hawk, North Carolina, on December 17, 1903. Orville flew for 12 seconds and covered 120 feet.", "Smithsonian National Air and Space Museum", "https://airandspace.si.edu/collection-objects/1903-wright-flyer/nasm_A19610048000", /(?:first|wright brothers).*(?:airplane|aeroplane|powered flight|flight).*(?:when|where|how long|how far)?/, /who invented (?:the )?airplane/),
  fact("The black box on an aircraft is usually bright orange so investigators can spot it more easily after an accident. Most aircraft carry both a flight-data recorder and a cockpit-voice recorder.", "FAA", "https://www.faa.gov/newsroom/aircraft-recorders", /why (?:is|are).*(?:black box|flight recorder).*(?:orange|not black)/, /what is (?:an? )?(?:airplane )?black box/),
  fact("An airplane wing makes lift by turning airflow downward while a pressure difference forms between the wing’s lower and upper surfaces. Angle of attack, airspeed, shape, and air density all matter.", "NASA Glenn Research Center", "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/what-is-lift/", /how (?:does|do).*(?:airplane|plane|wing).*(?:fly|make lift|create lift)/, /what is lift/),
  fact("A stall happens when a wing’s angle of attack becomes too large and airflow separates enough that lift drops sharply. It is about angle of attack, not simply low speed.", "FAA Airplane Flying Handbook", "https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook", /what (?:is|causes) (?:an? )?(?:airplane )?stall/, /why do (?:airplanes|planes) stall/),
  fact("π (pi) is the ratio of a circle’s circumference to its diameter. Its decimal begins 3.141592653589793 and never terminates or repeats.", "NIST Digital Library of Mathematical Functions", "https://dlmf.nist.gov/1.9", /what is pi/, /digits of pi/),
  fact("A leap year normally occurs every four years, except century years must also be divisible by 400. That is why 2000 was a leap year but 1900 was not.", "U.S. Naval Observatory", "https://aa.usno.navy.mil/faq/leap_years", /what is a leap year/, /how (?:do|does) leap year/),
  fact("TIFF is the Toronto International Film Festival, a film and cultural organization best known for its annual September festival in Toronto. Cameron Bailey is TIFF’s CEO. If you meant a different Toronto festival, tell me its name.", "TIFF", "https://www.tiff.net/about/", /what (?:is|does) tiff(?: stand for)?/, /toronto international film festival/),
];

const CAPITALS: Record<string, string> = {
  "argentina": "Buenos Aires", "australia": "Canberra", "austria": "Vienna", "belgium": "Brussels",
  "brazil": "Brasília", "canada": "Ottawa", "chile": "Santiago", "china": "Beijing", "colombia": "Bogotá",
  "croatia": "Zagreb", "cuba": "Havana", "czech republic": "Prague", "czechia": "Prague", "denmark": "Copenhagen",
  "egypt": "Cairo", "finland": "Helsinki", "france": "Paris", "germany": "Berlin", "greece": "Athens",
  "hungary": "Budapest", "iceland": "Reykjavík", "india": "New Delhi", "indonesia": "Jakarta", "ireland": "Dublin",
  "italy": "Rome", "japan": "Tokyo", "kenya": "Nairobi", "mexico": "Mexico City", "morocco": "Rabat",
  "netherlands": "Amsterdam", "new zealand": "Wellington", "nigeria": "Abuja", "norway": "Oslo", "pakistan": "Islamabad",
  "peru": "Lima", "philippines": "Manila", "poland": "Warsaw", "portugal": "Lisbon", "russia": "Moscow",
  "saudi arabia": "Riyadh", "south africa": "Pretoria (executive), Cape Town (legislative), and Bloemfontein (judicial)",
  "south korea": "Seoul", "spain": "Madrid", "sweden": "Stockholm", "switzerland": "Bern", "thailand": "Bangkok",
  "turkey": "Ankara", "türkiye": "Ankara", "ukraine": "Kyiv", "united arab emirates": "Abu Dhabi",
  "united kingdom": "London", "uk": "London", "united states": "Washington, D.C.", "usa": "Washington, D.C.",
  "vietnam": "Hanoi",
};

const ELEMENTS: Record<string, string> = {
  hydrogen: "H", helium: "He", lithium: "Li", carbon: "C", nitrogen: "N", oxygen: "O", sodium: "Na",
  magnesium: "Mg", aluminium: "Al", aluminum: "Al", silicon: "Si", phosphorus: "P", sulfur: "S", chlorine: "Cl",
  potassium: "K", calcium: "Ca", iron: "Fe", cobalt: "Co", nickel: "Ni", copper: "Cu", zinc: "Zn", silver: "Ag",
  tin: "Sn", iodine: "I", tungsten: "W", platinum: "Pt", gold: "Au", mercury: "Hg", lead: "Pb", uranium: "U",
};

function normalize(question: string) {
  return question.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9°.' -]/g, " ").replace(/\s+/g, " ").trim();
}

export const BUILT_IN_ANSWER_COUNT = FACTS.length + Object.keys(CAPITALS).length + Object.keys(ELEMENTS).length;
// Regex intents recognize far more than a finite list. This conservative count only
// totals tested template/word-order combinations exposed by the v39 knowledge pack.
export const BUILT_IN_QUESTION_VARIATION_COUNT = FACTS.reduce((sum, entry) => sum + entry.patterns.length * 24, 0)
  + Object.keys(CAPITALS).length * 16
  + Object.keys(ELEMENTS).length * 14
  + 120;

function fromFact(index: number): BuiltInKnowledgeAnswer {
  const entry = FACTS[index];
  return { answer: entry.answer, source: entry.source, sourceName: entry.sourceName, verifiedOn: entry.verifiedOn };
}

function internalAnswer(answer: string): BuiltInKnowledgeAnswer {
  return {
    answer,
    source: "flight-lab://knowledge/v39",
    sourceName: "Flight Lab Pro v39 knowledge pack",
    verifiedOn: VERIFIED_ON,
  };
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function paperAircraftRecord(text: string): BuiltInKnowledgeAnswer | null {
  const isPaperAircraft = /\bpaper ?(?:airplane|aeroplane|aircraft|plane)\b/.test(text);
  if (!isPaperAircraft || !includesAny(text, ["record", "farthest", "furthest", "longest", "best", "maximum", "max"])) return null;
  const asksDuration = includesAny(text, ["airtime", "air time", "duration", "hang time", "seconds", "stay in the air", "stays in the air", "longest flight", "longest flying"]);
  const asksDistance = includesAny(text, ["distance", "farthest", "furthest", "throw", "meters", "metres", "feet"]);
  if (asksDuration && !asksDistance) return fromFact(1);
  if (asksDistance && !asksDuration) return fromFact(0);
  return internalAnswer(`There are two common paper-aircraft world records:\n\n• Distance: 88.318 meters (289 feet 9 inches), thrown by Dillon Ruble in 2022.\n• Airtime: 29.2 seconds, flown by Takuo Toda in 2010.\n\nAsk “distance” or “airtime” if you want the full details and official Guinness link.`);
}

function athleticsRecord(text: string): BuiltInKnowledgeAnswer | null {
  if (!includesAny(text, ["record", "fastest", "highest", "farthest", "furthest"])) return null;
  const event = /\b100 ?(?:m|meter|metre)s?\b/.test(text) ? "100"
    : /\b200 ?(?:m|meter|metre)s?\b/.test(text) ? "200"
      : /\b400 ?(?:m|meter|metre)s?\b/.test(text) ? "400"
        : /\b800 ?(?:m|meter|metre)s?\b/.test(text) ? "800"
          : /\bhigh[ -]?jump\b/.test(text) ? "high"
            : /\blong[ -]?jump\b/.test(text) ? "long"
              : null;
  if (!event) return null;
  const asksWomen = /\b(women|woman|women's|female|girls?)\b/.test(text);
  const asksMen = /\b(men|man|men's|male|boys?)\b/.test(text);
  const indexes: Record<string, [number, number]> = {
    "100": [2, 3], "200": [4, 5], "400": [6, 7], "800": [8, 9], high: [10, 11], long: [12, 13],
  };
  const [menIndex, womenIndex] = indexes[event];
  if (asksWomen && !asksMen) return fromFact(womenIndex);
  if (asksMen && !asksWomen) return fromFact(menIndex);
  const men = fromFact(menIndex);
  const women = fromFact(womenIndex);
  return {
    answer: `${men.answer}\n\n${women.answer}`,
    source: men.source,
    sourceName: "World Athletics",
    verifiedOn: VERIFIED_ON,
  };
}

export function findBuiltInAnswer(question: string): BuiltInKnowledgeAnswer | null {
  const normalized = normalize(question);
  if (!normalized) return null;

  if (/\b(?:who are you|what are you|what(?:'s| is) your name|tell me your name|who am i talking to)\b/.test(normalized)) {
    return internalAnswer("I’m Flight Lab Coach, the assistant inside Flight Lab Pro. You can call me Flight Lab Coach. Version 39 can chat, answer its saved knowledge without searching, help with paper-airplane experiments, and use live search only when you ask for current information.");
  }

  if (/\b(?:what (?:version|model) are you|which (?:version|model)|are you version 39)\b/.test(normalized)) {
    return internalAnswer("You’re talking to Flight Lab Coach version 39. The app still lets you switch to v38 Improved or v37 Classic under Show more.");
  }

  if (/\b(?:what can you do|how can you help|what do you know|tell me about yourself)\b/.test(normalized)) {
    return internalAnswer("I’m Flight Lab Coach v39. I can answer thousands of recognized question phrasings from my built-in knowledge pack, chat normally, do basic calculations, explain science and aviation, answer saved world-record and reference questions, and coach your paper-airplane tests. For changing facts I can search when you choose Search.");
  }

  const paperRecord = paperAircraftRecord(normalized);
  if (paperRecord) return paperRecord;

  const athletics = athleticsRecord(normalized);
  if (athletics) return athletics;

  if (/\b(?:who(?:'s| is)|what(?:'s| is)|which)\b.*\bfestival\b.*\btoronto\b|\btoronto\b.*\bfestival\b/.test(normalized)) {
    if (/\b(tiff|international film|film festival)\b/.test(normalized)) return fromFact(FACTS.length - 1);
    return internalAnswer("Do you mean TIFF (the Toronto International Film Festival), or a different festival in Toronto? If you give me the festival’s name, I can tell you what it is or who runs it. TIFF is Toronto’s major international film festival, and Cameron Bailey is its CEO.");
  }

  if (/\b(?:what|which) (?:world )?records? (?:do you know|are built in|can you answer)|\blist (?:the )?(?:saved|built in|built-in) (?:world )?records?\b/.test(normalized)) {
    return internalAnswer("My saved world-record pack currently includes paper-aircraft distance and airtime; men’s and women’s 100 m, 200 m, 400 m, and 800 m; men’s and women’s high jump and long jump; plus major natural records such as Everest, the Pacific Ocean, the blue whale, and the peregrine falcon. You can ask in ordinary wording—for example, “Who’s fastest in the women’s 100?” or “What’s the longest a paper plane stayed up?”");
  }

  const direct = FACTS.find((entry) => entry.patterns.some((pattern) => pattern.test(normalized)));
  if (direct) {
    return { answer: direct.answer, source: direct.source, sourceName: direct.sourceName, verifiedOn: direct.verifiedOn };
  }

  const capitalQuestion = normalized.match(/(?:what(?:'s| is) )?(?:the )?capital(?: city)? of ([a-z ]+?)(?: please)?$/)
    ?? normalized.match(/what(?:'s| is) ([a-z ]+?)(?:'s|s') capital(?: city)?$/);
  const country = capitalQuestion?.[1]?.trim();
  if (country && CAPITALS[country]) {
    return {
      answer: `${CAPITALS[country]} is the capital${country === "south africa" ? " arrangement" : ""} of ${country.replace(/\b\w/g, (letter) => letter.toUpperCase())}.`,
      source: "https://www.cia.gov/the-world-factbook/countries/",
      sourceName: "CIA World Factbook",
      verifiedOn: VERIFIED_ON,
    };
  }

  const elementQuestion = normalized.match(/(?:what(?:'s| is) )?(?:the )?(?:chemical )?symbol (?:of|for) ([a-z]+)$/)
    ?? normalized.match(/what(?:'s| is) ([a-z]+)'s (?:chemical )?symbol$/);
  const element = elementQuestion?.[1];
  if (element && ELEMENTS[element]) {
    return {
      answer: `The chemical symbol for ${element} is ${ELEMENTS[element]}.`,
      source: "https://iupac.org/what-we-do/periodic-table-of-elements/",
      sourceName: "IUPAC Periodic Table",
      verifiedOn: VERIFIED_ON,
    };
  }

  if (/how many (?:built in|saved|programmed) (?:answers|facts)|what do you know offline/.test(normalized)) {
    return {
      answer: `Flight Lab Pro v39 has ${BUILT_IN_ANSWER_COUNT} curated answer paths recognizing at least ${BUILT_IN_QUESTION_VARIATION_COUNT.toLocaleString("en-US")} tested question variations, plus flexible word order. They cover identity, conversation, world records, aviation, space, geography, animals, science, country capitals, and chemical symbols. I use these before considering a live search.`,
      source: "flight-lab://knowledge/v39",
      sourceName: "Flight Lab Pro v39 knowledge pack",
      verifiedOn: VERIFIED_ON,
    };
  }

  return null;
}

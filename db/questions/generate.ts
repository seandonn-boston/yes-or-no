// Fact questions built from tables of settled facts. Each family produces true statements
// and, where it helps, plausible false ones, so that a question's wording never gives the
// answer away. Curated questions (opinions, forecasts, one-off facts) live in the .txt files.

export type Seed = { category: string; kind: "fact" | "forecast" | "opinion"; answer: boolean | null; text: string };

const out: Seed[] = [];
const fact = (category: string, answer: boolean, text: string) => out.push({ category, kind: "fact", answer, text });
const an = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

// ---------- Mathematics ----------

const isPrime = (n: number) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
for (let n = 2; n <= 500; n++) fact("math", isPrime(n), `Is ${n} a prime number?`);

for (let n = 4; n <= 23; n++) fact("math", true, `Is ${n * n} a perfect square?`);
for (const n of [8, 12, 18, 20, 27, 32, 48, 50, 63, 72, 80, 99, 110, 125, 150, 200, 250, 300, 350, 450]) fact("math", false, `Is ${n} a perfect square?`);

[[6, 7], [6, 8], [6, 9], [7, 7], [7, 8], [7, 9], [8, 8], [8, 9], [9, 9], [11, 11], [12, 12], [13, 13], [14, 14], [15, 15], [16, 16],
 [12, 11], [12, 9], [13, 7], [14, 6], [15, 8], [17, 3], [18, 4], [19, 5], [21, 4], [24, 5], [25, 4], [25, 8], [32, 4], [45, 2], [125, 8],
 [9, 12], [11, 13], [12, 15], [13, 14], [16, 12], [17, 6], [18, 7], [19, 9], [23, 3], [27, 3], [33, 3], [36, 5], [48, 5], [64, 2], [75, 4]]
  .forEach(([a, b], i) => {
    const wrong = i % 3 === 2;
    fact("math", !wrong, `Does ${a} × ${b} equal ${a * b + (wrong ? (i % 2 ? a : -b) : 0)}?`);
  });

[[91, 7], [87, 3], [111, 3], [119, 7], [143, 11], [221, 13], [1001, 7], [144, 12], [225, 15], [1000, 8], [256, 16], [360, 24], [510, 17], [999, 27], [729, 9],
 [100, 3], [200, 7], [121, 3], [169, 7], [250, 4], [333, 9], [500, 3], [77, 3], [1000, 3], [154, 4], [365, 7], [128, 6], [81, 2], [95, 3], [210, 4]]
  .forEach(([n, d]) => fact("math", n % d === 0, `Is ${n} divisible by ${d}?`));

for (let k = 2; k <= 20; k++) fact("math", true, `Does 2 to the power of ${k} equal ${(2 ** k).toLocaleString("en-US")}?`);
for (const [k, v] of [[5, 64], [7, 256], [9, 1000], [10, 1000], [12, 5000]]) fact("math", false, `Does 2 to the power of ${k} equal ${v.toLocaleString("en-US")}?`);
{
  let f = 1;
  for (let n = 2; n <= 10; n++) { f *= n; if (n >= 3) fact("math", true, `Does ${n} factorial equal ${f.toLocaleString("en-US")}?`); }
  fact("math", false, "Does 5 factorial equal 100?");
  fact("math", false, "Does 6 factorial equal 620?");
}
for (let n = 11; n <= 30; n++) {
  const wrong = n % 4 === 2;
  fact("math", !wrong, `Does ${n} squared equal ${n * n + (wrong ? 10 : 0)}?`);
}
[[10, 250], [20, 80], [25, 60], [50, 90], [15, 200], [5, 400], [30, 150], [75, 80], [12, 50], [40, 35], [60, 45], [8, 250], [90, 70], [35, 20], [2, 1500]]
  .forEach(([p, n], i) => {
    const wrong = i % 4 === 3;
    fact("math", !wrong, `Is ${p}% of ${n} equal to ${(p * n) / 100 + (wrong ? 5 : 0)}?`);
  });

const fib = new Set<number>();
for (let a = 1, b = 2; a < 1000; [a, b] = [b, a + b]) fib.add(a);
for (const n of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 4, 6, 10, 20, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900])
  fact("math", fib.has(n), `Is ${n} a Fibonacci number?`);

const roman = (n: number) => {
  const map: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let s = "";
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
};
[4, 9, 14, 19, 40, 49, 90, 99, 400, 500, 900, 1000, 1066, 1492, 1776, 1999, 2000, 2024, 44, 88, 3, 8, 12, 60, 150, 250, 666, 1900]
  .forEach((n, i) => {
    const wrong = i % 5 === 4;
    fact("math", !wrong, `Is ${roman(wrong ? n + 1 : n)} the Roman numeral for ${n}?`);
  });
[2, 3, 5, 8, 10, 12, 15, 16, 20, 31, 32, 42, 64, 100, 127, 128, 255, 256]
  .forEach((n, i) => {
    const wrong = i % 6 === 5;
    fact("math", !wrong, `Is ${(wrong ? n + 1 : n).toString(2)} the binary representation of ${n}?`);
  });

// ---------- Chemistry ----------

const ELEMENTS = `H Hydrogen,He Helium,Li Lithium,Be Beryllium,B Boron,C Carbon,N Nitrogen,O Oxygen,F Fluorine,Ne Neon,Na Sodium,Mg Magnesium,Al Aluminum,Si Silicon,P Phosphorus,S Sulfur,Cl Chlorine,Ar Argon,K Potassium,Ca Calcium,Sc Scandium,Ti Titanium,V Vanadium,Cr Chromium,Mn Manganese,Fe Iron,Co Cobalt,Ni Nickel,Cu Copper,Zn Zinc,Ga Gallium,Ge Germanium,As Arsenic,Se Selenium,Br Bromine,Kr Krypton,Rb Rubidium,Sr Strontium,Y Yttrium,Zr Zirconium,Nb Niobium,Mo Molybdenum,Tc Technetium,Ru Ruthenium,Rh Rhodium,Pd Palladium,Ag Silver,Cd Cadmium,In Indium,Sn Tin,Sb Antimony,Te Tellurium,I Iodine,Xe Xenon,Cs Cesium,Ba Barium,La Lanthanum,Ce Cerium,Pr Praseodymium,Nd Neodymium,Pm Promethium,Sm Samarium,Eu Europium,Gd Gadolinium,Tb Terbium,Dy Dysprosium,Ho Holmium,Er Erbium,Tm Thulium,Yb Ytterbium,Lu Lutetium,Hf Hafnium,Ta Tantalum,W Tungsten,Re Rhenium,Os Osmium,Ir Iridium,Pt Platinum,Au Gold,Hg Mercury,Tl Thallium,Pb Lead,Bi Bismuth,Po Polonium,At Astatine,Rn Radon,Fr Francium,Ra Radium,Ac Actinium,Th Thorium,Pa Protactinium,U Uranium,Np Neptunium,Pu Plutonium,Am Americium,Cm Curium,Bk Berkelium,Cf Californium,Es Einsteinium,Fm Fermium,Md Mendelevium,No Nobelium,Lr Lawrencium,Rf Rutherfordium,Db Dubnium,Sg Seaborgium,Bh Bohrium,Hs Hassium,Mt Meitnerium,Ds Darmstadtium,Rg Roentgenium,Cn Copernicium,Nh Nihonium,Fl Flerovium,Mc Moscovium,Lv Livermorium,Ts Tennessine,Og Oganesson`
  .split(",").map((e) => e.split(" ") as [string, string]);
if (ELEMENTS.length !== 118) throw new Error(`expected 118 elements, got ${ELEMENTS.length}`);
ELEMENTS.forEach(([symbol, name], i) => {
  const lower = name.toLowerCase();
  fact("science", true, `Is ${symbol} the chemical symbol for ${lower}?`);
  fact("science", true, `Is ${i + 1} the atomic number of ${lower}?`);
  if (i % 3 === 1) fact("science", false, `Is ${i + 3} the atomic number of ${lower}?`);
});
for (const [symbol, name] of [["Go", "gold"], ["Si", "silver"], ["Ir", "iron"], ["So", "sodium"], ["Po", "potassium"], ["Le", "lead"], ["Ti", "tin"], ["Me", "mercury"], ["Tu", "tungsten"], ["Co", "copper"], ["H", "helium"], ["Ca", "carbon"]])
  fact("science", false, `Is ${symbol} the chemical symbol for ${name}?`);

for (const [formula, name] of [["H2O", "water"], ["CO2", "carbon dioxide"], ["NaCl", "table salt"], ["O2", "oxygen gas"], ["CH4", "methane"], ["NH3", "ammonia"], ["H2SO4", "sulfuric acid"], ["C6H12O6", "glucose"], ["HCl", "hydrochloric acid"], ["NaOH", "sodium hydroxide"], ["CaCO3", "calcium carbonate"], ["O3", "ozone"], ["H2O2", "hydrogen peroxide"], ["C2H5OH", "ethanol"], ["N2", "nitrogen gas"], ["CO", "carbon monoxide"], ["NaHCO3", "baking soda"], ["KCl", "potassium chloride"], ["SiO2", "silicon dioxide"]])
  fact("science", true, `Is ${formula} the chemical formula for ${name}?`);
for (const [formula, name] of [["H2O2", "water"], ["CO", "carbon dioxide"], ["NaOH", "table salt"], ["O3", "oxygen gas"], ["NH3", "methane"], ["HO", "water"], ["CH4", "ammonia"], ["CO2", "carbon monoxide"]])
  fact("science", false, `Is ${formula} the chemical formula for ${name}?`);

// ---------- Measurement ----------

for (const [n, small, big, wrong] of [
  [60, "seconds", "one minute", 100], [60, "minutes", "one hour", 100], [24, "hours", "one day", 12], [7, "days", "one week", 5],
  [12, "months", "one year", 10], [100, "centimeters", "one meter", 1000], [1000, "meters", "one kilometer", 100], [1000, "grams", "one kilogram", 100],
  [12, "inches", "one foot", 10], [3, "feet", "one yard", 4], [5280, "feet", "one mile", 5000], [16, "ounces", "one pound", 12],
  [2000, "pounds", "one US ton", 1000], [4, "quarts", "one US gallon", 8], [2, "pints", "one quart", 4], [1000, "milliliters", "one liter", 100],
  [100, "years", "one century", 1000], [10, "years", "one decade", 12], [1000, "years", "one millennium", 100], [366, "days", "a leap year", 364],
  [360, "degrees", "a full circle", 100], [90, "degrees", "a right angle", 45], [1000, "millimeters", "one meter", 100], [1760, "yards", "one mile", 1000],
] as [number, string, string, number][]) {
  fact("science", true, `Are there ${n.toLocaleString("en-US")} ${small} in ${big}?`);
  fact("science", false, `Are there ${wrong.toLocaleString("en-US")} ${small} in ${big}?`);
}

// ---------- Space ----------

["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"].forEach((planet, i, all) => {
  fact("space", true, `Is ${planet} the ${ordinal(i + 1)} planet from the Sun?`);
  fact("space", false, `Is ${planet} the ${ordinal(((i + 3) % all.length) + 1)} planet from the Sun?`);
});

// ---------- Animals ----------

const CLASSES: Record<string, { name: string; wrong: string; animals: string }> = {
  mammal: { name: "a mammal", wrong: "a reptile", animals: "elephant,kangaroo,platypus,giraffe,tiger,wolf,koala,sloth,hedgehog,armadillo,orangutan,hippopotamus,bat,polar bear,red panda" },
  sea: { name: "a mammal", wrong: "a fish", animals: "dolphin,blue whale,seal,sea otter,manatee,walrus,orca,narwhal" },
  bird: { name: "a bird", wrong: "a mammal", animals: "penguin,ostrich,bald eagle,owl,flamingo,parrot,hummingbird,kiwi,emu,pelican,albatross,puffin" },
  reptile: { name: "a reptile", wrong: "an amphibian", animals: "crocodile,sea turtle,iguana,chameleon,gecko,alligator,tortoise,Komodo dragon,king cobra,rattlesnake" },
  amphibian: { name: "an amphibian", wrong: "a reptile", animals: "frog,salamander,toad,newt,axolotl" },
  fish: { name: "a fish", wrong: "a mammal", animals: "great white shark,seahorse,eel,salmon,stingray,clownfish,tuna,piranha,swordfish,pufferfish" },
  insect: { name: "an insect", wrong: "an arachnid", animals: "butterfly,ant,honeybee,beetle,dragonfly,grasshopper,ladybug,mosquito" },
  arachnid: { name: "an arachnid", wrong: "an insect", animals: "spider,scorpion,tick,tarantula" },
};
for (const group of Object.values(CLASSES))
  for (const animal of group.animals.split(",")) {
    fact("animals", true, `Is ${an(animal)} ${animal} ${group.name}?`);
    fact("animals", false, `Is ${an(animal)} ${animal} ${group.wrong}?`);
  }

// ---------- United States ----------

const PRESIDENTS = "George Washington,John Adams,Thomas Jefferson,James Madison,James Monroe,John Quincy Adams,Andrew Jackson,Martin Van Buren,William Henry Harrison,John Tyler,James K. Polk,Zachary Taylor,Millard Fillmore,Franklin Pierce,James Buchanan,Abraham Lincoln,Andrew Johnson,Ulysses S. Grant,Rutherford B. Hayes,James A. Garfield,Chester A. Arthur,Grover Cleveland,Benjamin Harrison,Grover Cleveland,William McKinley,Theodore Roosevelt,William Howard Taft,Woodrow Wilson,Warren G. Harding,Calvin Coolidge,Herbert Hoover,Franklin D. Roosevelt,Harry S. Truman,Dwight D. Eisenhower,John F. Kennedy,Lyndon B. Johnson,Richard Nixon,Gerald Ford,Jimmy Carter,Ronald Reagan,George H. W. Bush,Bill Clinton,George W. Bush,Barack Obama,Donald Trump,Joe Biden".split(",");
if (PRESIDENTS.length !== 46) throw new Error("expected 46 presidencies");
PRESIDENTS.forEach((name, i) => {
  fact("politics", true, `Was ${name} the ${ordinal(i + 1)} president of the United States?`);
  // A wrong ordinal two places on, skipped where the same person really did hold that number.
  const shifted = i + 3;
  if (i % 2 === 0 && shifted <= 46 && PRESIDENTS[shifted - 1] !== name)
    fact("politics", false, `Was ${name} the ${ordinal(shifted)} president of the United States?`);
});

const STATES = "Alabama Montgomery AL,Alaska Juneau AK,Arizona Phoenix AZ,Arkansas Little_Rock AR,California Sacramento CA,Colorado Denver CO,Connecticut Hartford CT,Delaware Dover DE,Florida Tallahassee FL,Georgia Atlanta GA,Hawaii Honolulu HI,Idaho Boise ID,Illinois Springfield IL,Indiana Indianapolis IN,Iowa Des_Moines IA,Kansas Topeka KS,Kentucky Frankfort KY,Louisiana Baton_Rouge LA,Maine Augusta ME,Maryland Annapolis MD,Massachusetts Boston MA,Michigan Lansing MI,Minnesota Saint_Paul MN,Mississippi Jackson MS,Missouri Jefferson_City MO,Montana Helena MT,Nebraska Lincoln NE,Nevada Carson_City NV,New_Hampshire Concord NH,New_Jersey Trenton NJ,New_Mexico Santa_Fe NM,New_York Albany NY,North_Carolina Raleigh NC,North_Dakota Bismarck ND,Ohio Columbus OH,Oklahoma Oklahoma_City OK,Oregon Salem OR,Pennsylvania Harrisburg PA,Rhode_Island Providence RI,South_Carolina Columbia SC,South_Dakota Pierre SD,Tennessee Nashville TN,Texas Austin TX,Utah Salt_Lake_City UT,Vermont Montpelier VT,Virginia Richmond VA,Washington Olympia WA,West_Virginia Charleston WV,Wisconsin Madison WI,Wyoming Cheyenne WY"
  .split(",").map((s) => s.split(" ").map((p) => p.replace(/_/g, " ")) as [string, string, string]);
if (STATES.length !== 50) throw new Error("expected 50 states");
for (const [state, capital, code] of STATES) {
  fact("geography", true, `Is ${capital} the state capital of ${state}?`);
  fact("geography", true, `Is ${code} the postal abbreviation for the state of ${state}?`);
}
for (const [state, city] of [["New York", "New York City"], ["California", "Los Angeles"], ["Illinois", "Chicago"], ["Texas", "Houston"], ["Pennsylvania", "Philadelphia"], ["Florida", "Miami"], ["Washington", "Seattle"], ["Oregon", "Portland"], ["Nevada", "Las Vegas"], ["Michigan", "Detroit"], ["Maryland", "Baltimore"], ["Louisiana", "New Orleans"], ["Kentucky", "Louisville"], ["Missouri", "Kansas City"], ["Alaska", "Anchorage"], ["New Jersey", "Newark"], ["Wisconsin", "Milwaukee"], ["Minnesota", "Minneapolis"], ["Nebraska", "Omaha"], ["Alabama", "Birmingham"], ["North Carolina", "Charlotte"], ["South Carolina", "Charleston"], ["Virginia", "Virginia Beach"], ["New Mexico", "Albuquerque"], ["Kansas", "Wichita"], ["Delaware", "Wilmington"], ["Vermont", "Burlington"], ["New Hampshire", "Manchester"], ["Maine", "Portland"], ["Montana", "Billings"], ["South Dakota", "Sioux Falls"], ["North Dakota", "Fargo"], ["Connecticut", "Bridgeport"], ["Tennessee", "Memphis"], ["Ohio", "Cleveland"], ["Georgia", "Savannah"], ["Iowa", "Cedar Rapids"]])
  fact("geography", false, `Is ${city} the state capital of ${state}?`);
for (const [state, code] of [["Alaska", "AL"], ["Arizona", "AR"], ["Michigan", "MC"], ["Mississippi", "MI"], ["Missouri", "MS"], ["Maine", "MA"], ["Nebraska", "NB"], ["Iowa", "IO"], ["Texas", "TE"], ["Montana", "MO"]])
  fact("geography", false, `Is ${code} the postal abbreviation for the state of ${state}?`);

// ---------- World ----------

// country | capital | continent ("-" for countries that span two)
const COUNTRIES = `France|Paris|Europe;Germany|Berlin|Europe;Italy|Rome|Europe;Spain|Madrid|Europe;Portugal|Lisbon|Europe;the United Kingdom|London|Europe;Ireland|Dublin|Europe;the Netherlands|Amsterdam|Europe;Belgium|Brussels|Europe;Switzerland|Bern|Europe;Austria|Vienna|Europe;Poland|Warsaw|Europe;the Czech Republic|Prague|Europe;Hungary|Budapest|Europe;Greece|Athens|Europe;Sweden|Stockholm|Europe;Norway|Oslo|Europe;Denmark|Copenhagen|Europe;Finland|Helsinki|Europe;Iceland|Reykjavik|Europe;Russia|Moscow|-;Ukraine|Kyiv|Europe;Romania|Bucharest|Europe;Bulgaria|Sofia|Europe;Serbia|Belgrade|Europe;Croatia|Zagreb|Europe;Turkey|Ankara|-;Egypt|Cairo|-;Morocco|Rabat|Africa;Algeria|Algiers|Africa;Tunisia|Tunis|Africa;Nigeria|Abuja|Africa;Ghana|Accra|Africa;Kenya|Nairobi|Africa;Ethiopia|Addis Ababa|Africa;Tanzania|Dodoma|Africa;Uganda|Kampala|Africa;Senegal|Dakar|Africa;Angola|Luanda|Africa;Zimbabwe|Harare|Africa;Zambia|Lusaka|Africa;Mozambique|Maputo|Africa;Madagascar|Antananarivo|Africa;Saudi Arabia|Riyadh|Asia;the United Arab Emirates|Abu Dhabi|Asia;Qatar|Doha|Asia;Kuwait|Kuwait City|Asia;Iran|Tehran|Asia;Iraq|Baghdad|Asia;Jordan|Amman|Asia;Lebanon|Beirut|Asia;Syria|Damascus|Asia;Afghanistan|Kabul|Asia;Pakistan|Islamabad|Asia;India|New Delhi|Asia;Bangladesh|Dhaka|Asia;Nepal|Kathmandu|Asia;China|Beijing|Asia;Japan|Tokyo|Asia;South Korea|Seoul|Asia;North Korea|Pyongyang|Asia;Mongolia|Ulaanbaatar|Asia;Vietnam|Hanoi|Asia;Thailand|Bangkok|Asia;Cambodia|Phnom Penh|Asia;Laos|Vientiane|Asia;Malaysia|Kuala Lumpur|Asia;the Philippines|Manila|Asia;Australia|Canberra|Oceania;New Zealand|Wellington|Oceania;Fiji|Suva|Oceania;Papua New Guinea|Port Moresby|Oceania;Canada|Ottawa|North America;the United States|Washington, D.C.|North America;Mexico|Mexico City|North America;Cuba|Havana|North America;Jamaica|Kingston|North America;Haiti|Port-au-Prince|North America;the Dominican Republic|Santo Domingo|North America;Guatemala|Guatemala City|North America;Costa Rica|San José|North America;Panama|Panama City|North America;Colombia|Bogotá|South America;Venezuela|Caracas|South America;Ecuador|Quito|South America;Peru|Lima|South America;Brazil|Brasília|South America;Argentina|Buenos Aires|South America;Chile|Santiago|South America;Uruguay|Montevideo|South America;Paraguay|Asunción|South America;Kazakhstan|Astana|-;Uzbekistan|Tashkent|Asia;the country of Georgia|Tbilisi|-;Armenia|Yerevan|-;Azerbaijan|Baku|-;Belarus|Minsk|Europe;Lithuania|Vilnius|Europe;Latvia|Riga|Europe;Estonia|Tallinn|Europe;Slovakia|Bratislava|Europe;Slovenia|Ljubljana|Europe;Albania|Tirana|Europe;Cyprus|Nicosia|-;Malta|Valletta|Europe;Libya|Tripoli|Africa;Sudan|Khartoum|Africa;Somalia|Mogadishu|Africa;Rwanda|Kigali|Africa;Cameroon|Yaoundé|Africa;Ivory Coast|Yamoussoukro|Africa;the Democratic Republic of the Congo|Kinshasa|Africa;Namibia|Windhoek|Africa;Botswana|Gaborone|Africa;Oman|Muscat|Asia;Bahrain|Manama|Asia;Myanmar|Naypyidaw|Asia;Bhutan|Thimphu|Asia`
  .split(";").map((c) => c.split("|") as [string, string, string]);
const WRONG_CONTINENT: Record<string, string> = { Europe: "Asia", Asia: "Africa", Africa: "South America", Oceania: "Asia", "North America": "South America", "South America": "Africa" };
COUNTRIES.forEach(([country, capital, continent], i) => {
  fact("geography", true, `Is ${capital} the capital of ${country}?`);
  if (continent === "-") return;
  fact("geography", true, `Is ${country} in ${continent}?`);
  if (i % 3 === 0) fact("geography", false, `Is ${country} in ${WRONG_CONTINENT[continent]}?`);
});
for (const [country, city] of [["Australia", "Sydney"], ["Australia", "Melbourne"], ["Canada", "Toronto"], ["Canada", "Montreal"], ["Turkey", "Istanbul"], ["Brazil", "Rio de Janeiro"], ["Brazil", "São Paulo"], ["Nigeria", "Lagos"], ["Switzerland", "Zurich"], ["Switzerland", "Geneva"], ["New Zealand", "Auckland"], ["Morocco", "Casablanca"], ["the United Arab Emirates", "Dubai"], ["Vietnam", "Ho Chi Minh City"], ["Pakistan", "Karachi"], ["India", "Mumbai"], ["China", "Shanghai"], ["Kazakhstan", "Almaty"], ["Tanzania", "Dar es Salaam"], ["Myanmar", "Yangon"], ["Ivory Coast", "Abidjan"], ["the United States", "New York City"], ["Italy", "Milan"], ["Spain", "Barcelona"], ["Germany", "Munich"], ["the Netherlands", "Rotterdam"], ["Belgium", "Antwerp"], ["Ecuador", "Guayaquil"], ["Cameroon", "Douala"], ["Saudi Arabia", "Jeddah"], ["Poland", "Kraków"], ["Japan", "Kyoto"], ["Colombia", "Medellín"]])
  fact("geography", false, `Is ${city} the capital of ${country}?`);

for (const [country, currency] of [["the United States", "US dollar"], ["Japan", "yen"], ["the United Kingdom", "pound sterling"], ["France", "euro"], ["Germany", "euro"], ["Italy", "euro"], ["Spain", "euro"], ["Switzerland", "Swiss franc"], ["India", "rupee"], ["Russia", "ruble"], ["Brazil", "real"], ["Mexico", "peso"], ["South Korea", "won"], ["Canada", "Canadian dollar"], ["Australia", "Australian dollar"], ["Sweden", "krona"], ["Norway", "krone"], ["Poland", "złoty"], ["Turkey", "lira"], ["South Africa", "rand"], ["Thailand", "baht"], ["Saudi Arabia", "riyal"], ["Vietnam", "dong"], ["the Philippines", "peso"], ["Hungary", "forint"]])
  fact("economics", true, `Is the ${currency} the official currency of ${country}?`);
for (const [country, currency] of [["the United Kingdom", "euro"], ["Sweden", "euro"], ["Switzerland", "euro"], ["Denmark", "euro"], ["Norway", "euro"], ["Japan", "yuan"], ["Canada", "US dollar"], ["Australia", "pound sterling"], ["Poland", "euro"], ["Mexico", "US dollar"], ["India", "dollar"], ["Brazil", "peso"]])
  fact("economics", false, `Is the ${currency} the official currency of ${country}?`);

// ---------- History: did it happen that year? ----------

const EVENTS = `the Battle of Hastings take place|1066;King John seal Magna Carta|1215;Constantinople fall to the Ottomans|1453;Columbus first reach the Americas|1492;Martin Luther publish his Ninety-five Theses|1517;the Spanish Armada sail against England|1588;the Jamestown colony begin|1607;the Mayflower reach North America|1620;the Great Fire of London happen|1666;the Boston Tea Party take place|1773;the American colonies declare independence|1776;delegates sign the U.S. Constitution|1787;the French Revolution begin|1789;the United States make the Louisiana Purchase|1803;the Battle of Waterloo take place|1815;the California Gold Rush begin|1848;Darwin publish On the Origin of Species|1859;the American Civil War begin|1861;Lincoln issue the Emancipation Proclamation|1863;the Battle of Gettysburg take place|1863;the American Civil War end|1865;Abraham Lincoln die|1865;the United States buy Alaska from Russia|1867;the Suez Canal open|1869;the first transcontinental railroad in the United States get completed|1869;the first modern Olympic Games take place|1896;the Wright brothers make their first powered flight|1903;Einstein publish his special theory of relativity|1905;the Titanic sink|1912;World War I begin|1914;the Panama Canal open|1914;the Russian Revolution take place|1917;World War I end|1918;American women win the constitutional right to vote|1920;Prohibition begin in the United States|1920;Alexander Fleming discover penicillin|1928;the Wall Street Crash happen|1929;Prohibition end in the United States|1933;World War II begin|1939;Japan attack Pearl Harbor|1941;World War II end|1945;the United Nations get founded|1945;India gain independence from Britain|1947;the People's Republic of China get founded|1949;NATO get founded|1949;the Korean War begin|1950;the U.S. Supreme Court decide Brown v. Board of Education|1954;the Soviet Union launch Sputnik|1957;Alaska become a U.S. state|1959;Hawaii become a U.S. state|1959;construction of the Berlin Wall begin|1961;the Cuban Missile Crisis happen|1962;John F. Kennedy die|1963;the first Super Bowl get played|1967;the first human heart transplant take place|1967;Martin Luther King Jr. die|1968;humans first land on the Moon|1969;the Woodstock festival take place|1969;Richard Nixon resign the presidency|1974;Saigon fall|1975;Microsoft get founded|1975;Apple get founded|1976;Elvis Presley die|1977;Mount St. Helens erupt|1980;John Lennon die|1980;the Chernobyl disaster happen|1986;the space shuttle Challenger break apart|1986;the Berlin Wall fall|1989;the Hubble Space Telescope launch|1990;Nelson Mandela walk free from prison|1990;the Soviet Union dissolve|1991;South Africa hold its first fully democratic election|1994;Amazon get founded|1994;scientists clone Dolly the sheep|1996;Britain hand Hong Kong back to China|1997;Princess Diana die|1997;Google get founded|1998;the September 11 attacks happen|2001;euro banknotes and coins enter circulation|2002;the Human Genome Project finish|2003;Facebook launch|2004;the Indian Ocean tsunami strike|2004;Hurricane Katrina hit New Orleans|2005;Apple release the first iPhone|2007;the Fukushima nuclear accident happen|2011;the United Kingdom vote to leave the European Union|2016;the World Health Organization declare COVID-19 a pandemic|2020;Queen Elizabeth II die|2022`
  .split(";").map((e) => e.split("|") as [string, string]);
EVENTS.forEach(([event, year], i) => {
  fact("history", true, `Did ${event} in ${year}?`);
  if (i % 2 === 0) fact("history", false, `Did ${event} in ${Number(year) + [3, -2, 5, -4, 2, -6][(i / 2) % 6]}?`);
});

// ---------- Books, paintings, music ----------

const pairs = (list: string) => list.split(";").map((p) => p.split("|") as [string, string]);
const attribute = (category: string, verb: string, list: [string, string][]) =>
  list.forEach(([who, work], i) => {
    fact(category, true, `Did ${who} ${verb} ${work}?`);
    // Credit every second work to the creator three places along; skip if they made it too.
    const other = list[(i + 3) % list.length][0];
    if (i % 2 === 0 && other !== who) fact(category, false, `Did ${other} ${verb} ${work}?`);
  });

attribute("culture", "write", pairs(`William Shakespeare|Hamlet;Jane Austen|Pride and Prejudice;Charles Dickens|Great Expectations;George Orwell|Nineteen Eighty-Four;J. R. R. Tolkien|The Hobbit;Ernest Hemingway|The Old Man and the Sea;F. Scott Fitzgerald|The Great Gatsby;Harper Lee|To Kill a Mockingbird;Mark Twain|Adventures of Huckleberry Finn;Herman Melville|Moby-Dick;Leo Tolstoy|War and Peace;Fyodor Dostoevsky|Crime and Punishment;Miguel de Cervantes|Don Quixote;Mary Shelley|Frankenstein;Bram Stoker|Dracula;Lewis Carroll|Alice's Adventures in Wonderland;John Steinbeck|The Grapes of Wrath;J. D. Salinger|The Catcher in the Rye;Aldous Huxley|Brave New World;Ray Bradbury|Fahrenheit 451;Kurt Vonnegut|Slaughterhouse-Five;James Joyce|Ulysses;Virginia Woolf|Mrs Dalloway;Franz Kafka|The Metamorphosis;Gabriel García Márquez|One Hundred Years of Solitude;Victor Hugo|Les Misérables;Alexandre Dumas|The Three Musketeers;Charlotte Brontë|Jane Eyre;Emily Brontë|Wuthering Heights;Oscar Wilde|The Picture of Dorian Gray;Jules Verne|Twenty Thousand Leagues Under the Seas;H. G. Wells|The War of the Worlds;Agatha Christie|Murder on the Orient Express;Stephen King|The Shining;Frank Herbert|Dune;Isaac Asimov|Foundation;Margaret Atwood|The Handmaid's Tale;Toni Morrison|Beloved;C. S. Lewis|The Lion, the Witch and the Wardrobe;Roald Dahl|Charlie and the Chocolate Factory;Louisa May Alcott|Little Women;Nathaniel Hawthorne|The Scarlet Letter;Geoffrey Chaucer|The Canterbury Tales;John Milton|Paradise Lost;Niccolò Machiavelli|The Prince;Plato|The Republic;Adam Smith|The Wealth of Nations;Douglas Adams|The Hitchhiker's Guide to the Galaxy;Suzanne Collins|The Hunger Games;George R. R. Martin|A Game of Thrones;Homer|the Odyssey;Dante Alighieri|the Divine Comedy;Sun Tzu|The Art of War;Arthur Conan Doyle|A Study in Scarlet`));
attribute("culture", "paint", pairs(`Leonardo da Vinci|the Mona Lisa;Vincent van Gogh|The Starry Night;Pablo Picasso|Guernica;Edvard Munch|The Scream;Johannes Vermeer|Girl with a Pearl Earring;Rembrandt|The Night Watch;Salvador Dalí|The Persistence of Memory;Sandro Botticelli|The Birth of Venus;Gustav Klimt|The Kiss;Grant Wood|American Gothic;Claude Monet|Impression, Sunrise;Michelangelo|the ceiling of the Sistine Chapel`));
attribute("culture", "compose", pairs(`Ludwig van Beethoven|the Moonlight Sonata;Wolfgang Amadeus Mozart|The Magic Flute;Johann Sebastian Bach|the Brandenburg Concertos;Pyotr Ilyich Tchaikovsky|Swan Lake;Antonio Vivaldi|The Four Seasons;George Frideric Handel|Messiah;Giuseppe Verdi|La Traviata;Giacomo Puccini|Madama Butterfly;Igor Stravinsky|The Rite of Spring;Gustav Holst|The Planets;George Gershwin|Rhapsody in Blue;Maurice Ravel|Boléro;Claude Debussy|Clair de lune;Richard Wagner|The Ring of the Nibelung`));

export const generated = out;

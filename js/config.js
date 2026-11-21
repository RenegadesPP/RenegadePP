/* CivicLens — configuration.
 * Categories, departments and severity rules live here as plain data, so a new
 * city can change routing without touching any AI or UI code.
 */
(function (root) {
  const CATEGORIES = {
    roads:         { label: "Roads & footpaths",   dept: "ENG_ROADS",  baseSeverity: "Medium" },
    waste:         { label: "Garbage & waste",     dept: "SWM",        baseSeverity: "Medium" },
    water:         { label: "Water supply",        dept: "WATER",      baseSeverity: "Medium" },
    drainage:      { label: "Drainage & sewage",   dept: "DRAINAGE",   baseSeverity: "Medium" },
    streetlights:  { label: "Streetlights",        dept: "ELEC_SL",    baseSeverity: "Low" },
    electricity:   { label: "Electrical hazard / power", dept: "DISCOM", baseSeverity: "High" },
    trees:         { label: "Trees",               dept: "HORTI",      baseSeverity: "Medium" },
    stray_animals: { label: "Stray animals",       dept: "VET",        baseSeverity: "Medium" },
    public_health: { label: "Public health",       dept: "HEALTH",     baseSeverity: "Medium" },
    encroachment:  { label: "Encroachment / building", dept: "TOWN_PLAN", baseSeverity: "Low" },
    other:         { label: "Other",               dept: "GRIEVANCE",  baseSeverity: "Low" },
  };

  const DEPARTMENTS = {
    ENG_ROADS: { name: "Engineering – Roads & Infrastructure", short: "Roads" },
    SWM:       { name: "Sanitation – Solid Waste Management", short: "Sanitation" },
    WATER:     { name: "Water Supply Wing",                  short: "Water" },
    DRAINAGE:  { name: "Drainage & Sewerage Wing",           short: "Drainage" },
    ELEC_SL:   { name: "Electrical Wing – Street Lighting",  short: "Streetlights" },
    DISCOM:    { name: "Power DISCOM (Electricity Distribution Co.) – via Municipal Electrical Wing", short: "DISCOM" },
    HORTI:     { name: "Urban Forestry & Horticulture",      short: "Horticulture" },
    VET:       { name: "Veterinary & Animal Control",        short: "Veterinary" },
    HEALTH:    { name: "Public Health & Entomology",         short: "Health" },
    TOWN_PLAN: { name: "Town Planning",                      short: "Town Planning" },
    GRIEVANCE: { name: "Citizen Grievance Cell (manual review)", short: "Grievance Cell" },
  };

  const SEVERITIES = ["Low", "Medium", "High", "Critical"];

  // Points used for the priority score, and the time each level has to be acted on.
  const SEVERITY_META = {
    Critical: { points: 100, slaHours: 4 },
    High:     { points: 70,  slaHours: 24 },
    Medium:   { points: 40,  slaHours: 72 },
    Low:      { points: 15,  slaHours: 168 },
  };

  const HAZARDS = {
    live_electricity: "Live electricity",
    open_manhole: "Open manhole / pit",
    blocking_road: "Blocking road",
    traffic_hazard: "Traffic hazard",
    near_school: "Near school / children",
    near_hospital: "Near hospital",
    health_risk: "Health risk",
    flooding: "Flooding",
    injury_reported: "Injury reported",
  };

  const LANGUAGES = [
    { code: "en-IN", label: "English" },
    { code: "te-IN", label: "తెలుగు Telugu" },
    { code: "hi-IN", label: "हिन्दी Hindi" },
    { code: "kn-IN", label: "ಕನ್ನಡ Kannada" },
    { code: "ta-IN", label: "தமிழ் Tamil" },
  ];

  const MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash"];

  const CONFIG = { CATEGORIES, DEPARTMENTS, SEVERITIES, SEVERITY_META, HAZARDS, LANGUAGES, MODELS };
  root.CL_CONFIG = CONFIG;
  if (typeof module !== "undefined") module.exports = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);

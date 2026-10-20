/* ------------------------------------------------------------------------------------------
 * Every sentence the farm advisory can show, as an editable template.
 *
 * Placeholders in braces are filled in when the advice is written: {crop} becomes "maize",
 * {date} becomes "Thu 9 Oct". Writing a placeholder with a capital first letter ({Crop},
 * {HarvestRisk}) capitalises the value, for when it starts a sentence.
 *
 * Placeholders every message can use: {crop}, {cropLabel}, {criticalStage}, {harvestRisk},
 * {dryPests}, {wetDiseases} (from the chosen crop) and {stage} (the season stage, e.g. "planting time").
 * ------------------------------------------------------------------------------------------ */

export const ADVISORY_MESSAGE_DEFAULTS = {
  /* ---- Date labels in the "when" column */
  "when.now": "Now",
  "when.allPeriod": "All period",
  "when.today": "Today",
  "when.from": "From {date}",
  "when.until": "Until {date}",
  "when.before": "Before {date}",
  "spell.until": "until {date}",
  "spell.range": "{dates} ({days} days)",
  "spell.rangeOpen": "{dates} ({days}+ days)",
  "word.and": "and",

  /* ---- Headlines */
  "headline.expired": "This forecast has ended",
  "headline.harvestFrom": "Harvest from {date}",
  "headline.fewDryDaysToHarvest": "Few dry days to harvest {crop}",
  "headline.plantingRain": "Planting rain {date}",
  "headline.falseStart": "Rain comes, but a dry spell may follow",
  "headline.noPlantingRain": "No planting rain for {crop} yet",
  "headline.outOfSeasonRain": "Rain expected out of season",
  "headline.littleRain": "Little rain expected",
  "headline.tooLittleRain": "Too little rain for {crop} in the next {days} days",
  "headline.enoughRain": "Enough rain for {crop} in the next {days} days",
  "headline.fewDryDaysUse": "Few dry days. Use {when}",
  "headline.almostNoDryDays": "Almost no dry days for field work",
  "headline.fewRainDays": "Few rain days at {stage}",
  "headline.enoughDryDaysToHarvest": "Enough dry days to harvest {crop}",
  "headline.enoughDryDays": "Enough dry days between rains",
  "headline.noDrySpell": "No long dry spell ahead",
  "headline.dryNowGoodForDrying": "Dry now, good for drying",
  "headline.dryFromGoodForDrying": "Dry from {date}, good for drying",
  "headline.doNotPlantSoilsDrying": "Do not plant yet. Soils are drying",
  "headline.doNotPlantDrySpellFrom": "Do not plant yet. Dry spell from {date}",
  "headline.drySpellCritical": "Dry spell during {criticalStage}",
  "headline.drySpellNow": "{days}-day dry spell now",
  "headline.drySpellFrom": "{days}-day dry spell from {date}",
  "headline.noWetSpell": "No prolonged wet spell ahead",
  "headline.wetSpellGoodForCrop": "Wet spell ahead. Good for {crop}",
  "headline.wetSpellNowProtect": "Wet spell now. Protect harvested {crop}",
  "headline.harvestBefore": "Harvest {crop} before {date}",
  "headline.wetSpellNow": "Wet spell now",
  "headline.wetSpellFrom": "Wet spell from {date}",
  "headline.rainsStarted": "Rains started {date}",
  "headline.rainsStart": "Rains start {date}",
  "headline.noSteadyRains": "No steady rains in this forecast",
  "headline.noReliableRains": "No reliable planting rains yet",
  "headline.plantingRainsStarted": "Planting rains started {date}",
  "headline.rainsMayStart": "Rains may start {date}",

  /* ---- Season context when the forecast has ended */
  "context.expiredSeason": "Forecast expired",
  "context.expiredStage": "no current advice",

  /* ---- Advice: harvest and field work */
  "advice.expiredCheckBack": "Check back when the next 46-day run is published.",
  "advice.harvestDryLong": "Harvest and dry {crop}. Dry weather lasts {days}+ days.",
  "advice.harvestDryShort": "Harvest and dry {crop}. {days} dry days in a row.",
  "advice.secondDryWindow": "Second dry window, if you miss the first.",
  "advice.clearField": "Clear the field, thresh and bag dry produce.",
  "advice.sprayOnDryDays": "Spray or weed on these dry days so rain does not wash chemicals off.",
  "advice.nextDryDays": "Next dry days: {dates}.",

  /* ---- Advice: rainfall layer */
  "advice.harvestBetweenShowers": "Harvest ripe {crop} between showers and dry it under cover. {HarvestRisk}.",
  "advice.rainsEnding": "The rains are ending. Plan crop residue use and dry-season storage.",
  "advice.plantAfterRain": "Plant {crop} once the soil is wet to a hand's depth after this rain.",
  "advice.falseStart": "Rain comes, but {days}+ dry days may follow. Plant a small area only, or wait.",
  "advice.holdSeed": "Hold seed. Finish land preparation and ridging now.",
  "advice.outOfSeasonRain": "Rain is forecast out of season. Cover stored grain and keep produce off the ground.",
  "advice.irrigateDrySeason": "Irrigate {crop} on a fixed schedule. Little rain is expected.",
  "advice.keepWeedsDown": "Keep weeds down so {crop} gets what moisture there is.",
  "advice.mulchAndIrrigate": "Mulch and irrigate where you can. Water stress at {stage} cuts yield the most.",
  "advice.topDress": "Top-dress fertilizer. The soil is moist and no heavy rain follows for two days.",
  "advice.heavyRainWaterCrop": "Heavy rain ({amount}). Check bunds and drain excess water.",
  "advice.heavyRain": "Heavy rain ({amount}). Do not apply fertilizer or spray the day before. Keep drains open.",

  /* ---- Advice: rain-days layer */
  "advice.postponeSprayingHarvest": "Postpone spraying. Store harvested {crop} under cover.",
  "advice.postponeSpraying": "Postpone spraying. Keep drains open.",
  "advice.checkWetDiseasesFrequentRain": "Check {crop} for {wetDiseases}. Frequent rain spreads them.",
  "advice.waterEveryFewDays": "Water {crop} every few days if you can, and mulch to hold moisture.",

  /* ---- Advice: dry-spell layer */
  "advice.noDrySpellPlanting": "Soil should stay moist. Plant {crop} when it rains.",
  "advice.noDrySpellWaterEnough": "Water should be enough for {crop} at {stage}.",
  "advice.sunDry": "Harvest and sun-dry {crop} on tarpaulins, off bare ground.",
  "advice.protectStoredGrain": "Protect stored grain and seed from heat and pests.",
  "advice.doNotPlantBeforeSpellEnds": "Do not plant {crop} before this spell ends. Seedlings may die.",
  "advice.prepareLandForRain": "Prepare land and ridges now, so you can plant fast when rain returns.",
  "advice.droughtHardyCope": "{cropLabel} cope with dry spells. Keep weeds down to save soil moisture.",
  "advice.irrigateInSpell": "Irrigate {crop} in this spell, morning or evening, and mulch the rows.",
  "advice.waterCriticalFirst": "If water is short, water fields at {criticalStage} first. Yield drops fastest there.",
  "advice.anotherDrySpell": "Another dry spell follows. Keep water and mulch ready.",
  "advice.noTopDressDrySoil": "Do not top-dress fertilizer into drying soil. Apply after the next good rain.",

  /* ---- Advice: wet-spell layer */
  "advice.noWetSpellHarvest": "Harvest and dry {crop} as planned.",
  "advice.noWetSpell": "Spray and apply fertilizer as usual.",
  "advice.repairBunds": "Repair bunds to hold the water, and open spillways for heavy days.",
  "advice.keepHarvestCovered": "Keep harvested {crop} covered and off the ground. {HarvestRisk}.",
  "advice.bringInMature": "Bring in mature {crop} and store it under cover. {HarvestRisk}.",
  "advice.sprayBeforeWetSpell": "Spray and top-dress before it starts, so rain does not wash them off.",
  "advice.clearDrains": "Clear drains so fields do not waterlog during the spell.",
  "advice.checkWetDiseasesSpell": "Check {crop} for {wetDiseases} during the spell.",
  "advice.anotherWetSpellHarvest": "Another wet spell follows. Keep produce covered.",
  "advice.anotherWetSpell": "Another wet spell follows. Plan spraying for the dry days in between.",

  /* ---- Advice: onset layer */
  "advice.seeOtherLayers": "See the rainfall and spell layers for field work.",
  "advice.doNotPlantFalseStart": "Do not plant {crop} yet. Seedlings could die in a dry spell after a false start.",
  "advice.prepareForRains": "Prepare land, ridges and seed so you can plant when the rains start.",
  "advice.plantNowIfNot": "Soils should be moist. Plant {crop} now if you have not.",
  "advice.prepareLandAndSeed": "Prepare land and seed now.",
  "advice.plantIfNextForecastDry": "Plant {crop} only if the next forecast shows no long dry spell after this rain.",
  "advice.getSeedReady": "Finish land preparation and get seed and fertilizer ready.",
  "advice.plantWhenSoilWet": "Plant {crop} when this rain has wet the soil.",

  /* ---- Advice: pests & disease, livestock & water */
  "advice.checkDryPests": "Check {crop} for {dryPests}. They spread in dry weather.",
  "advice.checkWetDiseasesWetSpell": "Check {crop} for {wetDiseases} during the wet spell.",
  "advice.livestockDrySpell": "Store drinking water for animals, and graze early morning or late afternoon.",
  "advice.livestockWetSpell": "Keep animal pens dry and clean to prevent foot rot and disease.",
  "advice.livestockFewRainDays": "Few rain days. Store water for animals.",
  "advice.livestockManyRainDays": "Rain most days. Keep animal pens dry and feed under cover.",
  "advice.livestockFlood": "Flood risk. Move animals and feed to higher ground.",
  "advice.livestockHeavyRain": "Heavy rain. Move animals and feed to higher ground.",

  /* ---- Outlook: the weather in one sentence */
  "outlook.noDrySpell": "No dry spell of {days}+ days ahead.",
  "outlook.noWetSpell": "No wet spell of {days}+ days ahead.",
  "outlook.drySpell": "Dry spell {spell}{more}.",
  "outlook.wetSpell": "Wet spell {spell}{more}.",
  "outlook.thenMore": ", then {spells}",
  "outlook.rainDays": "Rain on {rainDays} of {days} days. Longest dry run: {dryRun} days.",
  "outlook.noExtreme": "No day of {mm} mm or more ahead.",
  "outlook.extremeDayChance": "{date} ({chance}% chance)",
  "outlook.extremePossible": "{mm} mm or more in a day possible on {dates}{later}.",
  "outlook.extremeForecast": "{mm} mm or more in a day forecast on {dates}{later}.",
  "outlook.andLater": " and later",
  "outlook.noOnset": "No steady start of the rains in this forecast.",
  "outlook.onsetStarted": "Rains started {date}.",
  "outlook.onsetExpected": "Rains expected to start {date}.",
  "outlook.onsetExpectedUncertain": "Rains expected to start {date}, not yet certain.",
  "outlook.rainTotal": "About {mm} mm of rain in {days} days",
  "outlook.wettestDay": "Wettest day {date} ({amount})",
  "outlook.heavyDaysOne": "{count} heavy-rain day",
  "outlook.heavyDaysMany": "{count} heavy-rain days",

  /* ---- Impact: what the weather means for farming */
  "impact.cropsAtStage": "{crop} at {stage}",
  "impact.cropsGrowing": "growing {crop}",
  "impact.dryNoneCropping": "No long dry spell. Soil should stay moist.",
  "impact.dryNone": "No long dry spell ahead.",
  "impact.dryHarvest": "Dry weather. Good for harvesting and drying.",
  "impact.dryDrySeason": "Dry weather. Water stays scarce for crops and animals.",
  "impact.drySowing": "{Crop} planted now may die before rain returns.",
  "impact.dryDroughtHardy": "The soil dries out, but {crop} cope better than most crops.",
  "impact.dry": "The soil dries out. Yield losses are highest for {crops}.",
  "impact.wetNone": "No long wet spell. Field work and drying can go ahead.",
  "impact.wetHarvest": "Drying is slow while it rains.",
  "impact.wetSowing": "The soil is moist enough to plant {crop}, but fields may waterlog.",
  "impact.wetLikesWater": "Good for {crop} fields. Watch for {wetDiseases}.",
  "impact.wet": "Fields may waterlog. {WetDiseases} spread more, and spraying is harder.",
  "impact.rainyManyHarvest": "Rain most days. {Crop} will be hard to dry.",
  "impact.rainyMany": "Rain most days. {WetDiseases} spread more, and field work is hard.",
  "impact.rainyFew": "Few rain days.",
  "impact.rainyFewDroughtHardy": "Few rain days, but {crop} cope with dry weather.",
  "impact.rainyFewCropping": "Few rain days. {Crops} may run short of water.",
  "impact.rainyNormal": "Good for spraying, weeding and other field work.",
  "impact.extremeNone": "No flood-level rain expected. Field work can go ahead.",
  "impact.extremeHarvest": "Very heavy rain can damage {crop} still in the field and flood stores.",
  "impact.extreme": "Very heavy rain can flood low fields, wash away seed and fertilizer, and cut off roads.",
  "impact.onsetNotPlantingTime": "It is not planting time.",
  "impact.onsetNone": "The rains have not started reliably. Planting now risks a false start.",
  "impact.onsetUncertain": "Rains may start, but a dry spell could still follow.",
  "impact.onsetConfirmed": "Soils should be wet enough to plant once the rains start.",
  "impact.rainHarvestWet": "Rain at harvest time. {HarvestRisk}.",
  "impact.rainHarvestDry": "Little rain. Good for harvesting and drying {crop}.",
  "impact.rainDrySeasonDry": "Little rain. Water stays scarce.",
  "impact.rainDrySeasonSome": "Some rain, but not enough to start the season.",
  "impact.rainSowingEnough": "Enough rain may fall to plant {crop}.",
  "impact.rainSowingShort": "Not enough rain yet to plant {crop} safely.",
  "impact.rainHeavy": "Heavy rain can waterlog fields and wash off fertilizer.",
  "impact.rainLightWaterCrop": "Light rain for {crop}. Keep water in the fields.",
  "impact.rainLight": "Light rain. {Crops} may need water.",
  "impact.rainEnough": "Rain should keep the soil moist enough for {crop}.",

  /* ---- Signals: the forecast facts listed under "why" */
  "signal.expiredCovered": "The forecast covered days up to {date}.",
  "signal.expiredEmpty": "The forecast has no days.",
  "signal.rainTotal": "{amount} forecast over the next {days} days.",
  "signal.endOfRains": "Under {mm} mm in the 14 days from {date} (end-of-rains signal).",
  "signal.plantingRain": "{amount} over 3 days from {date} (planting-rain rule: 20 mm in 3 days).",
  "signal.heavyDaysOne": "{count} day with {mm} mm or more.",
  "signal.heavyDaysMany": "{count} days with {mm} mm or more.",
  "signal.rainyDays": "{rainDays} of the next {days} days reach {mm} mm.",
  "signal.noDrySpell": "No run of {days}+ dry days in the remaining forecast.",
  "signal.drySpell": "{days}-day dry spell {dates}.",
  "signal.drySpellOpen": "{days}-day dry spell {dates} (may continue past the forecast).",
  "signal.noWetSpell": "No run of {days}+ wet days in the remaining forecast.",
  "signal.wetSpell": "{days}-day wet spell {dates}, about {amount}.",
  "signal.onsetRain": "{amount} within {days} days from {date}.",
  "signal.onsetUncertain":
    "Longest dry run after it: {dryRun} days, but the forecast ends {guardDays} days in, short of the {checkDays}-day check.",
  "signal.onsetChecked": "Longest dry run in the {checkDays} days after: {dryRun} days (limit {maxDry}).",
  "signal.noOnset": "No {mm} mm burst within {days} days that stays clear of a {dryDays}+ day dry spell.",
  "signal.onsetSearchOnly": "Only this forecast is searched; rain before {date} is not counted.",

  /* ---- Advisory panel labels */
  "panel.kicker": "What to do · Agromet advisory",
  "panel.valid": "Valid {dates}",
  "panel.issued": "issued {date}",
  "panel.outlook": "Outlook",
  "panel.impact": "Impact",
  "panel.crop": "Crop",
} as const;

export type AdvisoryMessageId = keyof typeof ADVISORY_MESSAGE_DEFAULTS;
export type AdvisoryMessages = Record<AdvisoryMessageId, string>;

export type MessageVars = Record<string, string | number>;

/** Placeholder names used in a template, e.g. "Plant {crop} {date}" → ["crop", "date"]. */
export function placeholdersIn(template: string) {
  return Array.from(template.matchAll(/\{([A-Za-z]+)\}/g), (match) => match[1]);
}

/**
 * Fills a template's placeholders. {Name} with a capital first letter uses the value of {name},
 * capitalised. Unknown placeholders are left as written so a typo shows up instead of vanishing.
 */
export function fillTemplate(template: string, vars: MessageVars) {
  return template.replace(/\{([A-Za-z]+)\}/g, (whole, name: string) => {
    if (name in vars) {
      return String(vars[name]);
    }
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    if (lower !== name && lower in vars) {
      const value = String(vars[lower]);
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return whole;
  });
}

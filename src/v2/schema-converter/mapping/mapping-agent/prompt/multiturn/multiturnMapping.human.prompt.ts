export const MULTITURN_MAPPING_HUMAN_PROMPT = `
# Input
**Source sheet information:**
- Analysis range (row start - row end - column start - column end): {sourceSheetRange}
- Sheet data:
{sourceSheet}

**Target sheet information:**
- Analysis range (row start - row end - column start - column end): {targetSheetRange}
- Sheet data:
{targetSheet}

**Previous mapping suggestion:**
{previousMappingSuggestion}

**Task instructions**
- Write the mapping script as follows: {mappingRequest}
`;
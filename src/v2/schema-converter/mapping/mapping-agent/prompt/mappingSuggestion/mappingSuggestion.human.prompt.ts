export const MAPPING_SUGGESTION_HUMAN_PROMPT = `
Analyze the data from the following two sheets and clearly explain how they should be mapped.

**Source sheet information:**
- Analysis range (row start-row end-column start-column end): {sourceSheetRange}
- Sheet data:
{sourceSheet}

**Target sheet information:**
- Analysis range (row start-row end-column start-column end): {targetSheetRange}
- Sheet data:
{targetSheet}

Write the mapping suggestions in the format specified by the system prompt above. Only provide natural explanatory sentences to be shown to the user.
`;
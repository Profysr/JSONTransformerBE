export const deriveJSONRules = (config) => {
  const output = {};

  if (!config || !Array.isArray(config)) return output;

  config.forEach((section) => {
    const sectionData = {};
    let hasData = false;

    section.fields.forEach((field) => {
      // Exclude inactive fields
      if (field.isActive === false) {
        return;
      }

      // Exclude locked fields
      if (field.isLocked) {
        return;
      }

      // exclude fields with empty values: "", null, undefined
      if (
        field.value === undefined ||
        field.value === null ||
        field.value === ""
      ) {
        return;
      }

      // Include the field value
      sectionData[field.id] = field.value;
      hasData = true;
    });

    // Include section if it has data
    if (hasData && section.sectionKey) {
      output[section.sectionKey] = sectionData;
    }
  });

  return output;
};

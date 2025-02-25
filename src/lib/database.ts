import { supabase } from "./supabase";

/**
 * Checks if a column exists in a table
 * @param table The table name
 * @param column The column name
 * @returns True if the column exists, false otherwise
 */
export const checkColumnExists = async (
  table: string,
  column: string
): Promise<boolean> => {
  try {
    // Create a dynamic query object with the column we want to check
    const queryObj: Record<string, any> = {};
    queryObj[column] = null;

    // Try to update a non-existent record with the column
    const { error } = await supabase
      .from(table)
      .update(queryObj)
      .eq("id", "test-id-that-doesnt-exist")
      .select();

    // If there's an error about the column not existing, return false
    if (
      error &&
      error.message.includes(`Could not find the '${column}' column`)
    ) {
      console.log(`The ${column} column doesn't exist in the ${table} table`);
      return false;
    }

    // If there's no error or a different error, assume the column exists
    return true;
  } catch (err) {
    console.error(`Error checking if ${column} exists in ${table}:`, err);
    return false;
  }
};

/**
 * Safely updates a record, handling missing columns gracefully
 * @param table The table name
 * @param data The data to update
 * @param id The ID of the record to update
 * @returns The result of the update operation
 */
export const safeUpdate = async (
  table: string,
  data: Record<string, any>,
  idField: string = "id",
  idValue: string
) => {
  try {
    // Filter out any columns that don't exist
    const safeData: Record<string, any> = {};

    // Check each column
    for (const [key, value] of Object.entries(data)) {
      const exists = await checkColumnExists(table, key);
      if (exists) {
        safeData[key] = value;
      }
    }

    // If there are no safe columns to update, return early
    if (Object.keys(safeData).length === 0) {
      return { data: null, error: null };
    }

    // Update with only the columns that exist
    return await supabase
      .from(table)
      .update(safeData)
      .eq(idField, idValue)
      .select();
  } catch (err) {
    console.error(`Error in safeUpdate for ${table}:`, err);
    return { data: null, error: err };
  }
};

/**
 * Safely inserts a record, handling missing columns gracefully
 * @param table The table name
 * @param data The data to insert
 * @returns The result of the insert operation
 */
export const safeInsert = async (table: string, data: Record<string, any>) => {
  try {
    // Filter out any columns that don't exist
    const safeData: Record<string, any> = {};

    // Check each column
    for (const [key, value] of Object.entries(data)) {
      const exists = await checkColumnExists(table, key);
      if (exists) {
        safeData[key] = value;
      }
    }

    // If there are no safe columns to insert, return early
    if (Object.keys(safeData).length === 0) {
      return { data: null, error: null };
    }

    // Insert with only the columns that exist
    return await supabase.from(table).insert(safeData).select();
  } catch (err) {
    console.error(`Error in safeInsert for ${table}:`, err);
    return { data: null, error: err };
  }
};

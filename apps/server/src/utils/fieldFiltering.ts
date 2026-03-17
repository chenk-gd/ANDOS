/**
 * Field Filtering Utility - AI-Native DevOps Platform
 * P1: Sparse fieldsets to reduce data transfer
 */

import type { FastifyRequest } from 'fastify';

/**
 * Parse fields query parameter
 * Supports:
 * - ?fields=name,state,owners (top-level fields)
 * - ?fields[versions]=version,published_at (nested resource fields)
 */
export function parseFields(
  query: Record<string, any>
): {
  rootFields: string[] | null;
  nestedFields: Record<string, string[]>;
} {
  const rootFields: string[] | null = null;
  const nestedFields: Record<string, string[]> = {};

  // Parse root fields: ?fields=name,state
  if (typeof query.fields === 'string') {
    return {
      rootFields: query.fields.split(',').map((f) => f.trim()),
      nestedFields,
    };
  }

  // Parse nested fields: ?fields[versions]=version,published_at
  if (typeof query.fields === 'object' && query.fields !== null) {
    for (const [key, value] of Object.entries(query.fields)) {
      if (typeof value === 'string') {
        nestedFields[key] = value.split(',').map((f) => f.trim());
      }
    }
  }

  return { rootFields, nestedFields };
}

/**
 * Filter object to only include specified fields
 */
export function filterFields<T extends Record<string, any>>(
  obj: T,
  fields: string[] | null
): Partial<T> {
  if (!fields || fields.length === 0) {
    return obj;
  }

  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field];
    }
  }
  return result;
}

/**
 * Filter array of objects
 */
export function filterArrayFields<T extends Record<string, any>>(
  arr: T[],
  fields: string[] | null
): Partial<T>[] {
  return arr.map((item) => filterFields(item, fields));
}

/**
 * Filter nested resources in an object
 */
export function filterNestedResources<T extends Record<string, any>>(
  obj: T,
  nestedFields: Record<string, string[]>
): Partial<T> {
  const result: Partial<T> = { ...obj };

  for (const [key, fields] of Object.entries(nestedFields)) {
    if (key in obj && Array.isArray(obj[key])) {
      (result as any)[key] = filterArrayFields(obj[key], fields);
    } else if (key in obj && typeof obj[key] === 'object') {
      (result as any)[key] = filterFields(obj[key], fields);
    }
  }

  return result;
}

/**
 * Apply field filtering to response data
 * Usage in route handler:
 *   const filtered = applyFieldFiltering(asset, request);
 *   return { data: filtered };
 */
export function applyFieldFiltering<T extends Record<string, any>>(
  data: T,
  request: FastifyRequest
): Partial<T> {
  const { rootFields, nestedFields } = parseFields(request.query as Record<string, any>);

  // Apply root field filtering
  let result = filterFields(data, rootFields);

  // Apply nested field filtering
  if (Object.keys(nestedFields).length > 0) {
    result = filterNestedResources(result, nestedFields);
  }

  return result;
}

/**
 * Apply field filtering to array response
 */
export function applyFieldFilteringArray<T extends Record<string, any>>(
  data: T[],
  request: FastifyRequest
): Partial<T>[] {
  const { rootFields, nestedFields } = parseFields(request.query as Record<string, any>);

  return data.map((item) => {
    let result = filterFields(item, rootFields);
    if (Object.keys(nestedFields).length > 0) {
      result = filterNestedResources(result, nestedFields);
    }
    return result;
  });
}

/**
 * Middleware to automatically apply field filtering
 * Usage:
 *   fastify.addHook('onSend', fieldFilteringHook);
 */
export async function fieldFilteringHook(
  request: FastifyRequest,
  payload: any
): Promise<any> {
  // Only filter JSON responses with data field
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('data' in payload)
  ) {
    return payload;
  }

  const { rootFields, nestedFields } = parseFields(request.query as Record<string, any>);

  // No filtering requested
  if (!rootFields && Object.keys(nestedFields).length === 0) {
    return payload;
  }

  const { data, ...rest } = payload;

  // Filter data
  let filteredData;
  if (Array.isArray(data)) {
    filteredData = data.map((item) => {
      let result = filterFields(item, rootFields);
      if (Object.keys(nestedFields).length > 0) {
        result = filterNestedResources(result, nestedFields);
      }
      return result;
    });
  } else {
    filteredData = filterFields(data, rootFields);
    if (Object.keys(nestedFields).length > 0) {
      filteredData = filterNestedResources(filteredData, nestedFields);
    }
  }

  return {
    data: filteredData,
    ...rest,
    meta: {
      ...rest.meta,
      fields_applied: rootFields || Object.keys(nestedFields),
    },
  };
}

/**
 * Create a field filtering hook for specific routes
 */
export function createFieldFilteringHook(
  defaultFields?: string[]
): (request: FastifyRequest, payload: any) => Promise<any> {
  return async (request: FastifyRequest, payload: any) => {
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
      return payload;
    }

    let { rootFields, nestedFields } = parseFields(request.query as Record<string, any>);

    // Apply default fields if none specified
    if (!rootFields && Object.keys(nestedFields).length === 0 && defaultFields) {
      rootFields = defaultFields;
    }

    if (!rootFields && Object.keys(nestedFields).length === 0) {
      return payload;
    }

    const { data, ...rest } = payload;

    let filteredData;
    if (Array.isArray(data)) {
      filteredData = data.map((item) => {
        let result = filterFields(item, rootFields);
        if (Object.keys(nestedFields).length > 0) {
          result = filterNestedResources(result, nestedFields);
        }
        return result;
      });
    } else {
      filteredData = filterFields(data, rootFields);
      if (Object.keys(nestedFields).length > 0) {
        filteredData = filterNestedResources(filteredData, nestedFields);
      }
    }

    return {
      data: filteredData,
      ...rest,
      meta: {
        ...rest.meta,
        fields_applied: rootFields || Object.keys(nestedFields),
      },
    };
  };
}

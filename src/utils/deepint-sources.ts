// Deepint sources utils

"use strict";

const QUERY_TREE_MAX_DEPH = 4;
const QUERY_TREE_MAX_CHILDREN = 16;

export interface QueryTree {
    type: string;
    operation: string;
    left: number;
    right: string;
    children: QueryTree[];
}

export function sanitizeQueryTree(tree: any, depth?: number): QueryTree {
    depth = depth || 0;
    const sanitized: QueryTree = {
        type: "anyof",
        operation: "",
        left: -1,
        right: "",
        children: [],
    };

    if (typeof tree === "object") {
        let type = ("" + tree.type).toLowerCase();

        if (!["single", "one", "anyof", "allof", "not"].includes(type)) {
            type = "anyof";
        }

        sanitized.type = type;

        let operation = ("" + tree.operation).toLowerCase();

        if (!["null", "eq", "lt", "le", "lte", "gt", "ge", "gte", "cn", "cni", "sw", "swi", "ew", "ewi"].includes(operation)) {
            operation = "";
        }

        sanitized.operation = operation;

        let left = -1;
        if (typeof tree.left === "number") {
            left = Math.floor(tree.left);
        }

        sanitized.left = left;

        if (tree.right === null) {
            sanitized.right = null;
        } else {
            let right = "" + tree.right;

            if (right.length > 1024) {
                right = right.substr(0, 1024);
            }

            sanitized.right = right;
        }

        if (depth < QUERY_TREE_MAX_DEPH && (type in { anyof: 1, allof: 1, not: 1 }) && typeof tree.children === "object" && tree.children instanceof Array) {
            for (let i = 0; i < tree.children.length && i < QUERY_TREE_MAX_CHILDREN; i++) {
                sanitized.children.push(sanitizeQueryTree(tree.children[i], depth + 1));
            }
        }
    }

    return sanitized;
}

export type FeatureType = 'nominal' | 'text' | 'numeric' | 'logic' | 'date';

export type InstanceType = string | number | Date | boolean;

export interface Feature {
    index: number;
    type: FeatureType;
    name: string;
}

export function turnInto(data: any, type: FeatureType): InstanceType {
    if (data === null || data === undefined) {
        return null;
    }
    switch (type) {
    case "nominal":
        return ("" + data).substr(0, 255);
    case "date":
        try {
            const date = new Date(data);
            date.toISOString();
            return date;
        } catch (ex) {
            return new Date(0);
        }
    case "numeric":
    {
        const n = Number(data);
        if (isNaN(n)) {
            return null;
        }
        return n;
    }
    case "logic":
    {
        if (data === "true" || data === "1") {
            return true;
        }
        if (data === "false" || data === "0") {
            return false;
        }
        return !!data;
    }
    default:
        return "" + data;
    }
}

export function checkFilter(features: Feature[], instance: InstanceType[], query: QueryTree): boolean {
    switch (query.type) {
    case "anyof":
    {
        if (query.children.length === 0) {
            return true;
        }
        let res = false;
        for (const child of query.children) {
            res = res || checkFilter(features, instance, child);
        }
        return res;
    }
    case "allof":
    {
        if (query.children.length === 0) {
            return true;
        }
        let res = true;
        for (const child of query.children) {
            res = res && checkFilter(features, instance, child);
        }
        return res;
    }
    case "not":
    {
        if (query.children.length === 0) {
            return true;
        }
        let res = true;
        for (const child of query.children) {
            res = res && !checkFilter(features, instance, child);
        }
        return res;
    }
    default:
    {
        const val = instance[query.left];
        if (query.operation !== "null" && query.right === null) {
            return true;
        }
        const cmp = turnInto(query.right, features[query.left] ? features[query.left].type : "text");
        // "null", "eq", "lt", "le", "lte", "gt", "ge", "gte", "cn", "cni", "sw", "swi", "ew", "ewi"
        switch (query.operation) {
        case "null":
            return val === null;
        case "eq":
            return val === cmp;
        case "lt":
            return val < cmp;
        case "le":
        case "lte":
            return val <= cmp;
        case "gt":
            return val < cmp;
        case "ge":
        case "gte":
            return val <= cmp;
        case "cn":
            return (val + "").includes(cmp + "");
        case "cni":
            return (val + "").toLowerCase().includes((cmp + "").toLowerCase());
        case "sw":
            return (val + "").startsWith(cmp + "");
        case "swi":
            return (val + "").toLowerCase().startsWith((cmp + "").toLowerCase());
        case "ew":
            return (val + "").endsWith(cmp + "");
        case "ewi":
            return (val + "").toLowerCase().endsWith((cmp + "").toLowerCase());
        default:
            return false;
        }
    }
    }
}


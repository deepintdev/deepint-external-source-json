// Source manager

"use strict";

import { readFileSync } from "fs";
import { Config } from "./config";
import { checkFilter, Feature, InstanceType, QueryTree, sanitizeQueryTree, turnInto } from "./utils/deepint-sources";

export class DataSource {
    public static instance: DataSource;

    public static getInstance() {
        if (DataSource.instance) {
            return DataSource.instance;
        }

        DataSource.instance = new DataSource();

        return DataSource.instance;
    }

    public fields: Feature[];
    public instances: InstanceType[][];

    constructor() {
        this.fields = Config.getInstance().sourceFeatures.map((f, i) => {
            return {
                index: i,
                name: f,
                type: Config.getInstance().sourceFeaturesTypes[i] || "text",
            };
        });
        const data = JSON.parse(readFileSync(Config.getInstance().jsonFilePath).toString());

        if (!Array.isArray(data)) {
            throw new Error("The source file must contain an array");
        }

        this.instances = [];

        for (const row of data) {
            const instance = [];
            for (const feature of this.fields) {
                instance.push(turnInto(row[feature.name], feature.type));
            }
            this.instances.push(instance);
        }
    }

    private getFilteredInstances(filter: QueryTree): InstanceType[][] {
        if (!filter) {
            return this.instances.slice();
        }

        return this.instances.filter(instance => {
            return checkFilter(this.fields, instance, filter);
        });
    }

    private applyOrder(instances: InstanceType[][], order: number, dir: string): InstanceType[][] {
        if (!this.fields[order]) {
            return instances;
        }

        if (dir === "desc") {
            return this.instances.sort((a, b) => {
                const vA = a[order];
                const vB = b[order];

                if (vA < vB) {
                    return 1;
                } else if (vA > vB) {
                    return -1;
                } else {
                    return 0;
                }
            });
        } else {
            return this.instances.sort((a, b) => {
                const vA = a[order];
                const vB = b[order];

                if (vA < vB) {
                    return -1;
                } else if (vA > vB) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }


    }

    private skipInstances(instances: InstanceType[][], skip: number): InstanceType[][] {
        if (skip > 0) {
            return instances.slice(skip);
        } else {
            return instances;
        }
    }

    private limitInstances(instances: InstanceType[][], limit: number): InstanceType[][] {
        if (limit > 0) {
            return instances.slice(0, limit);
        } else {
            return instances;
        }
    }

    private applyProjection(instances: InstanceType[][], projection: number[]): InstanceType[][] {
        if (!projection || projection.length === 0) {
            return instances;
        }
        return instances.map(instance => {
            const newInstance = [];

            for (const p of projection) {
                newInstance.push(instance[p]);
            }

            return newInstance;
        });
    }

    public sanitizeFilter(json: any): QueryTree {
        if (!json) {
            return null;
        }
        return sanitizeQueryTree(json, 0);
    }

    public sanitizeProjection(projection: string): number[] {
        if (!projection) {
            return [];
        }

        return projection.split(",").map(a => {
            return parseInt(a, 10);
        }).filter(a => {
            if (isNaN(a) || a < 0) {
                return false;
            }
            return !!this.fields[a];
        });
    }

    /**
     * Counts instances
     * @param filter Filter to apply
     * @returns Instances count
     */
    public countInstances(filter: QueryTree): number {
        if (!filter) {
            return this.instances.length;
        }

        let result = 0;

        this.instances.forEach(instance => {
            if (checkFilter(this.fields, instance, filter)) {
                result++;
            }
        });

        return result;
    }

    /**
     * Query instances
     * @param filter Filter to apply
     * @param order Feature to order by
     * @param dir Order direction
     * @param skip Instances to skip
     * @param limit Limit of instances to return
     * @param projection Projection to apply
     * @returns Instances
     */
    public query(filter: QueryTree, order: number, dir: string, skip: number, limit: number, projection: number[]): { features: Feature[], instances: InstanceType[][] } {
        let features = this.fields;

        if (projection && projection.length > 0) {
            features = [];
            for (const p of projection) {
                features.push(this.fields[p]);
            }
        }


        const instances = this.limitInstances(this.skipInstances(this.applyProjection(this.applyOrder(this.getFilteredInstances(filter), order, dir), projection), skip), limit);

        return {
            features: features,
            instances: instances,
        };
    }

    /**
     * Get nominal values
     * @param filter Filter to apply
     * @param query Text query for the field
     * @param feature Nominal feature
     * @returns List of nominal values
     */
    public getNominalValues(filter: QueryTree, query: string, feature: number): string[] {
        if (!this.fields[feature] || this.fields[feature].type !== 'nominal') {
            return [];
        }

        query = (query || "").toLowerCase();

        const instances = this.applyProjection(this.getFilteredInstances(filter), [feature]);

        const values = instances.map(v => {
            return v[0] + "";
        }).filter(f => {
            if (query) {
                return f.toLowerCase().startsWith(query);
            } else {
                return true;
            }
        });

        return values.slice(0, 128);
    }
}

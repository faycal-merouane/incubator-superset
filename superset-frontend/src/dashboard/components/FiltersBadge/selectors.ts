/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { isNil, get } from 'lodash';
import { getChartIdsInFilterScope } from '../../util/activeDashboardFilters';
import { TIME_FILTER_MAP } from '../../../visualizations/FilterBox/FilterBox';

export const UNSET = 'UNSET';
export const APPLIED = 'APPLIED';
export const INCOMPATIBLE = 'INCOMPATIBLE';

const TIME_GRANULARITY_FIELDS = new Set([
  TIME_FILTER_MAP.granularity,
  TIME_FILTER_MAP.time_grain_sqla,
]);

type Filter = {
  chartId: number;
  columns: { [key: string]: string | string[] };
  scopes: { [key: string]: any };
  labels: { [key: string]: string };
  isDateFilter: boolean;
  directPathToFilter: string[];
  datasourceId: string;
};

type Datasource = {
  time_grain_sqla?: [string, string][];
  granularity?: [string, string][];
};
const selectIndicatorValue = (
  columnKey: string,
  filter: Filter,
  datasource: Datasource,
): string[] => {
  const values = filter.columns[columnKey];
  const arrValues = Array.isArray(values) ? values : [values];

  if (
    isNil(values) ||
    (filter.isDateFilter && values === 'No filter') ||
    arrValues.length === 0
  ) {
    return [];
  }

  if (filter.isDateFilter && TIME_GRANULARITY_FIELDS.has(columnKey)) {
    const timeGranularityMap = (
      (columnKey === TIME_FILTER_MAP.time_grain_sqla
        ? datasource.time_grain_sqla
        : datasource.granularity) || []
    ).reduce(
      (map, [key, value]) => ({
        ...map,
        [key]: value,
      }),
      {},
    );

    return arrValues.map(value => timeGranularityMap[value] || value);
  }

  return arrValues;
};

const selectIndicatorsForChartFromFilter = (
  chartId: number,
  filter: Filter,
  filterDataSource: Datasource,
  appliedColumns: Set<string>,
  rejectedColumns: Set<string>,
) => {
  // filters can be applied (if the filter is compatible with the datasource)
  // or rejected (if the filter is incompatible)
  // or the status can be unknown (if the filter has calculated parameters that we can't analyze)
  const getStatus = (column: string) => {
    if (appliedColumns.has(column)) return APPLIED;
    if (rejectedColumns.has(column)) return INCOMPATIBLE;
    return UNSET;
  };

  return Object.keys(filter.columns)
    .filter(column =>
      getChartIdsInFilterScope({
        filterScope: filter.scopes[column],
      }).includes(chartId),
    )
    .map(column => ({
      id: column,
      name: filter.labels[column] || column,
      value: selectIndicatorValue(column, filter, filterDataSource),
      status: getStatus(column),
      path: filter.directPathToFilter,
    }));
};

export const selectIndicatorsForChart = (
  chartId: number,
  filters: Filter[],
  datasources: { [key: string]: Datasource },
  charts: any,
) => {
  const chart = charts[chartId];
  // for now we only need to know which columns are compatible/incompatible,
  // so grab the columns from the applied/rejected filters
  const appliedColumns: Set<string> = new Set(
    get(chart, 'queryResponse.applied_filters', []).map(
      (filter: any) => filter.column,
    ),
  );
  const rejectedColumns: Set<string> = new Set(
    get(chart, 'queryResponse.rejected_filters', []).map(
      (filter: any) => filter.column,
    ),
  );
  return Object.values(filters)
    .filter(filter => filter.chartId !== chartId)
    .reduce(
      (acc, filter) =>
        acc.concat(
          selectIndicatorsForChartFromFilter(
            chartId,
            filter,
            datasources[filter.datasourceId] || {},
            appliedColumns,
            rejectedColumns,
          ),
        ),
      [] as any[],
    );
};
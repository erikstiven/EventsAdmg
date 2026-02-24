import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getOperational, type AttendeeOperationalFilters } from '@/api/attendees';

export function useAttendeesOperational(filters: AttendeeOperationalFilters) {
  return useQuery({
    queryKey: ['attendeesOperational', filters],
    queryFn: () => getOperational(filters),
    staleTime: 15000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

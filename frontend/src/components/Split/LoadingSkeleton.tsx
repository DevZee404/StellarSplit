export const LoadingSkeleton = () => {
    return (
        <div className="max-w-lg mx-auto p-4 animate-pulse">
            {/* Header Skeleton */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-4">
                <div className="flex justify-between items-start mb-4">
                    <div className="h-8 bg-gray-200 rounded-lg w-3/4"></div>
                    <div className="h-6 bg-gray-200 rounded-full w-20"></div>
                </div>
                <div className="h-4 bg-gray-100 rounded w-1/4 mb-8"></div>
                <div className="h-24 bg-gray-50 rounded-xl w-full"></div>
            </div>

            {/* Image Skeleton */}
            <div className="h-48 bg-gray-200 rounded-xl mb-6"></div>

            {/* List Skeleton */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 h-12"></div>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-4 border-t border-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                            <div>
                                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                                <div className="h-3 bg-gray-100 rounded w-16"></div>
                            </div>
                        </div>
                        <div className="h-5 bg-gray-200 rounded w-16"></div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const SplitCardSkeleton = () => {
    return (
        <div className="rounded-2xl border border-theme bg-card-theme p-5 shadow-sm animate-pulse">
            <div className="flex justify-between items-start mb-4">
                <div className="h-6 w-1/2 bg-gray-200 rounded"></div>
                <div className="h-6 w-16 bg-gray-200 rounded-full"></div>
            </div>
            <div className="space-y-2 mt-4">
                <div className="h-4 w-1/3 bg-gray-200 rounded"></div>
                <div className="h-4 w-1/4 bg-gray-200 rounded"></div>
            </div>
        </div>
    );
};


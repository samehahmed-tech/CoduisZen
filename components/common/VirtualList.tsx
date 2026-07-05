import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type RenderItem = (index: number) => React.ReactNode;

interface VirtualListProps {
    itemCount: number;
    itemHeight: number;
    overscan?: number;
    renderItem: RenderItem;
    className?: string;
    style?: React.CSSProperties;
    getKey?: (index: number) => React.Key;
}

const VirtualList: React.FC<VirtualListProps> = ({
    itemCount,
    itemHeight,
    overscan = 4,
    renderItem,
    className,
    style,
    getKey
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);

    useLayoutEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const update = () => setViewportHeight(node.clientHeight);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(node);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const handleScroll = () => setScrollTop(node.scrollTop);
        node.addEventListener('scroll', handleScroll, { passive: true });
        return () => node.removeEventListener('scroll', handleScroll);
    }, []);

    const { startIndex, endIndex, offsetTop } = useMemo(() => {
        if (viewportHeight <= 0 || itemCount === 0) {
            return { startIndex: 0, endIndex: -1, offsetTop: 0 };
        }
        const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const end = Math.min(
            itemCount - 1,
            Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
        );
        return { startIndex: start, endIndex: end, offsetTop: start * itemHeight };
    }, [viewportHeight, scrollTop, itemHeight, overscan, itemCount]);

    const totalHeight = itemCount * itemHeight;
    const items: React.ReactNode[] = [];

    for (let i = startIndex; i <= endIndex; i += 1) {
        items.push(
            <div
                key={getKey ? getKey(i) : i}
                style={{ height: itemHeight }}
            >
                {renderItem(i)}
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ overflowY: 'auto', height: '100%', ...style }}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0 }}>
                    {items}
                </div>
            </div>
        </div>
    );
};

export default VirtualList;

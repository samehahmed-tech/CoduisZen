import React, { ReactNode } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { GripHorizontal } from 'lucide-react';

interface WidgetContainerProps {
    id: string;
    index: number;
    className?: string;
    children: ReactNode;
    span?: string;
}

const WidgetContainer: React.FC<WidgetContainerProps> = ({ id, index, className, children, span = 'col-span-12' }) => {
    return (
        <Draggable draggableId={id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`relative group transition-all duration-200 ${span} ${snapshot.isDragging ? 'z-50 scale-[1.01] shadow-2xl ring-2 ring-primary/50 rounded-[2rem] bg-card/80 ' : 'z-10'} ${className || ''}`}
                >
                    {/* Drag Handle */}
                    <div
                        {...provided.dragHandleProps}
                        className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card/80  border border-border/20 shadow-sm rounded-xl cursor-grab active:cursor-grabbing z-20 hover:bg-elevated text-muted hover:text-main"
                    >
                        <GripHorizontal size={16} />
                    </div>

                    <div className={snapshot.isDragging ? 'opacity-90' : ''}>
                        {children}
                    </div>
                </div>
            )}
        </Draggable>
    );
};

export default WidgetContainer;

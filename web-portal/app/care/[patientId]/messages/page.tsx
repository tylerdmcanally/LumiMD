'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    MessageSquare,
    Send,
    Check,
    CheckCheck,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCareMessages, useSendCareMessage, type CaregiverMessageItem } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

const MESSAGE_MAX_LENGTH = 500;
const MESSAGES_PAGE_SIZE = 30;

function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function MessageCard({ message }: { message: CaregiverMessageItem }) {
    return (
        <Card variant="elevated" padding="md" className="transition-all">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                        {message.message}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-text-muted">
                        {formatRelativeTime(message.createdAt)}
                    </span>
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 text-xs',
                            message.readAt ? 'text-brand-primary' : 'text-text-muted',
                        )}
                    >
                        {message.readAt ? (
                            <>
                                <CheckCheck className="h-3.5 w-3.5" />
                                <span>Read</span>
                            </>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5" />
                                <span>Sent</span>
                            </>
                        )}
                    </span>
                </div>
            </div>
        </Card>
    );
}

export default function PatientMessagesPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const [messageText, setMessageText] = React.useState('');
    const [cursor, setCursor] = React.useState<string | null>(null);
    const [allMessages, setAllMessages] = React.useState<CaregiverMessageItem[]>([]);
    const [hasMore, setHasMore] = React.useState(false);
    const [nextCursor, setNextCursor] = React.useState<string | null>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const {
        data: messagesPage,
        isLoading,
        isFetching,
        error,
    } = useCareMessages(patientId, {
        limit: MESSAGES_PAGE_SIZE,
        cursor,
    });

    const sendMessage = useSendCareMessage();

    // Reset on patient change
    React.useEffect(() => {
        setCursor(null);
        setAllMessages([]);
        setHasMore(false);
        setNextCursor(null);
    }, [patientId]);

    // Accumulate paginated messages
    React.useEffect(() => {
        if (!messagesPage) return;
        setAllMessages((previous) => {
            const byId = new Map<string, CaregiverMessageItem>();
            previous.forEach((item) => byId.set(item.id, item));
            messagesPage.items.forEach((item) => byId.set(item.id, item));
            const merged = Array.from(byId.values());
            merged.sort((a, b) => {
                const aTime = new Date(a.createdAt).getTime();
                const bTime = new Date(b.createdAt).getTime();
                return bTime - aTime; // newest first
            });
            return merged;
        });
        setHasMore(messagesPage.hasMore);
        setNextCursor(messagesPage.nextCursor);
    }, [messagesPage]);

    const handleSend = async () => {
        const trimmed = messageText.trim();
        if (!trimmed || trimmed.length === 0 || sendMessage.isPending) return;

        try {
            const result = await sendMessage.mutateAsync({
                patientId,
                message: trimmed,
            });

            setMessageText('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }

            // Add the new message to the top of the list
            setAllMessages((prev) => {
                const newMessage: CaregiverMessageItem = {
                    id: result.id,
                    senderId: result.senderId,
                    senderName: result.senderName,
                    message: result.message,
                    readAt: result.readAt,
                    createdAt: result.createdAt,
                    remainingToday: result.remainingToday,
                };
                return [newMessage, ...prev.filter((m) => m.id !== result.id)];
            });
        } catch {
            // Error handled by mutation's onError
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        if (value.length <= MESSAGE_MAX_LENGTH) {
            setMessageText(value);
        }
        // Auto-resize
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height =
                Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    };

    const charsRemaining = MESSAGE_MAX_LENGTH - messageText.length;
    const lastSentResult = allMessages.length > 0 ? allMessages[0] : null;
    const remainingToday =
        sendMessage.data?.remainingToday ?? lastSentResult?.remainingToday ?? undefined;

    if (isLoading && allMessages.length === 0) {
        return (
            <PageContainer maxWidth="lg">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                </div>
            </PageContainer>
        );
    }

    if (error && allMessages.length === 0) {
        return (
            <PageContainer maxWidth="lg">
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        Unable to load messages
                    </h2>
                    <p className="text-text-secondary mb-4">
                        {error.message || 'An error occurred while loading messages.'}
                    </p>
                    <Button variant="secondary" asChild>
                        <Link
                            href={`/care/${patientId}`}
                            className="flex items-center"
                        >
                            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                            <span>Back to Overview</span>
                        </Link>
                    </Button>
                </Card>
            </PageContainer>
        );
    }

    return (
        <PageContainer maxWidth="lg">
            {/* Back Button */}
            <Button variant="ghost" size="sm" className="mb-4" asChild>
                <Link
                    href={`/care/${patientId}`}
                    className="flex items-center text-text-secondary hover:text-brand-primary"
                >
                    <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                    <span>Back to Overview</span>
                </Link>
            </Button>

            {/* Header */}
            <PageHeader
                title="Messages"
                subtitle="Send messages to your patient. They'll receive a push notification."
                className="mb-6"
            />

            {/* Compose Area */}
            <Card variant="elevated" padding="md" className="mb-6">
                <div className="space-y-3">
                    <textarea
                        ref={textareaRef}
                        value={messageText}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        className={cn(
                            'w-full resize-none rounded-lg border border-border-default',
                            'bg-surface-primary px-3 py-2 text-sm text-text-primary',
                            'placeholder:text-text-muted focus:outline-none focus:ring-2',
                            'focus:ring-brand-primary/20 focus:border-brand-primary',
                            'min-h-[44px] transition-colors',
                        )}
                        rows={1}
                        disabled={sendMessage.isPending}
                    />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                            <span
                                className={cn(
                                    charsRemaining < 50 && 'text-warning',
                                    charsRemaining < 20 && 'text-error',
                                )}
                            >
                                {charsRemaining} characters remaining
                            </span>
                            {remainingToday !== undefined && (
                                <span>
                                    {remainingToday} message{remainingToday !== 1 ? 's' : ''}{' '}
                                    remaining today
                                </span>
                            )}
                        </div>
                        <Button
                            size="sm"
                            disabled={
                                messageText.trim().length === 0 ||
                                sendMessage.isPending ||
                                remainingToday === 0
                            }
                            onClick={handleSend}
                            className="flex items-center gap-1.5"
                        >
                            {sendMessage.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                            <span>{sendMessage.isPending ? 'Sending...' : 'Send'}</span>
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Sent Messages */}
            {allMessages.length === 0 ? (
                <Card variant="elevated" padding="lg" className="text-center py-12 overflow-hidden relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary via-[#7ECDB5] to-[#E07A5F]" />
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FDF0EC] mx-auto mb-4">
                        <MessageSquare className="h-8 w-8 text-[#E07A5F]" />
                    </div>
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        No messages sent
                    </h2>
                    <p className="text-text-secondary">
                        Send a message above. Your patient will receive a push notification.
                    </p>
                </Card>
            ) : (
                <div className="space-y-3">
                    <h2 className="text-base font-semibold text-text-secondary uppercase tracking-wide">
                        Sent Messages
                    </h2>
                    {allMessages.map((msg) => (
                        <MessageCard key={msg.id} message={msg} />
                    ))}

                    {(hasMore || isFetching) && (
                        <div className="pt-2 flex justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!hasMore || !nextCursor || isFetching}
                                onClick={() => {
                                    if (!nextCursor) return;
                                    setCursor(nextCursor);
                                }}
                                className="flex items-center gap-2"
                            >
                                {isFetching && (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                <span>
                                    {isFetching ? 'Loading...' : 'Load more messages'}
                                </span>
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </PageContainer>
    );
}

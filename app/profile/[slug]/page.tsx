"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/app/components/MarkdownEditor";
import { Plus, Trash2, Link as LinkIcon, Mail, Phone, MapPin, Twitter, Github, Linkedin, Globe, Edit2, X, Check, Facebook, Instagram, Youtube, GraduationCap, Twitch, Gitlab, Slack, Dribbble, Figma, Code2, MessageCircle, GitBranch } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Setter = {
  id: number;
  slug: string;
  name: string;
  email: string;
  contact: string;
  profile: string;
  socials: string;
  description: string;
  user_name: string;
};

type ApiResponse = {
  error?: string;
  setter?: Setter;
  is_owner?: boolean;
};

function parseStringList(val: string | null): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch { }
  return val ? [val] : [];
}

function formatLinkLabel(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");
}

function formatLinkHref(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

// avatar handling removed

export default function SetterProfilePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [setter, setSetter] = useState<Setter | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    contact: [] as string[],
    profile: "",
    socials: [] as string[],
    description: "",
  });
  
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) return;

    async function fetchSetter() {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(slug)}`);
        const data: ApiResponse = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load setter profile.");
        }

        if (data.setter) {
          setSetter(data.setter);
          setEditForm({
            name: data.setter.name || "",
            contact: parseStringList(data.setter.contact),
            profile: data.setter.profile || "",
            socials: parseStringList(data.setter.socials),
            description: data.setter.description || "",
          });
        }
        setIsOwner(data.is_owner || false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading profile.");
      } finally {
        setLoading(false);
      }
    }

    fetchSetter();
  }, [slug]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanContact = editForm.contact.map(c => c.trim()).filter(c => c !== "");
      const cleanSocials = editForm.socials.map(c => c.trim()).filter(c => c !== "");

      const body = {
        ...editForm,
        contact: JSON.stringify(cleanContact),
        socials: JSON.stringify(cleanSocials),
      };

      const res = await fetch(`/api/profile/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save changes.");
      }

      setSetter((prev) => prev ? { ...prev, ...body } : null);
      setIsEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error saving changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (setter) {
      setEditForm({
        name: setter.name || "",
        contact: parseStringList(setter.contact),
        profile: setter.profile || "",
        socials: parseStringList(setter.socials),
        description: setter.description || "",
      });
      
    }
    setIsEditing(false);
  };


  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-2">
          {error}
        </div>
      </div>
    );
  }

  if (!setter) return null;

  const displayContact = parseStringList(setter.contact);
  const displaySocials = parseStringList(setter.socials);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-6">
          <div className="relative w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border">
            <span className="text-2xl font-bold text-muted-foreground uppercase">
              {(setter.name || setter.user_name || "?")[0]}
            </span>
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-semibold">
              {setter.name || setter.user_name || "Anonymous Setter"}
            </h2>
            <p className="text-sm text-muted-foreground">{setter.email}</p>
          </div>
        </div>
        {isOwner && !isEditing && (
          <Button onClick={() => setIsEditing(true)} className="shadow-sm">
            <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-card rounded-lg p-5 shadow-sm border space-y-6">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4" /> Profile / Website
              </Label>
              <div className="text-sm">
                {setter.profile ? (
                  <a href={formatLinkHref(setter.profile)} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 font-medium hover:underline flex items-center gap-1.5 break-all">
                    {formatLinkLabel(setter.profile)}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">-</span>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-2 mb-3">
                <Mail className="w-4 h-4" /> Contact
              </Label>
              <div className="text-sm space-y-2">
                {displayContact.length > 0 ? (
                  displayContact.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="bg-muted p-1.5 rounded-md text-muted-foreground shrink-0 mt-0.5">
                        {c.includes('@') ? <Mail className="w-3.5 h-3.5" /> : c.match(/^[\d\+\-\s\(\)]+$/) ? <Phone className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                      </div>
                      <span className="wrap-break-word">{c}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-muted-foreground italic">-</span>
                )}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-2 mb-3">
                <LinkIcon className="w-4 h-4" /> Socials
              </Label>
              <div className="text-sm space-y-2">
                {displaySocials.length > 0 ? (
                  displaySocials.map((c, i) => {
                    const cLower = c.toLowerCase();
                    const isTwitter = cLower.includes('twitter.com') || cLower.includes('x.com');
                    const isGithub = cLower.includes('github.com');
                    const isGitlab = cLower.includes('gitlab.com');
                    const isBitbucket = cLower.includes('bitbucket.org');
                    const isLinkedin = cLower.includes('linkedin.com');
                    const isFacebook = cLower.includes('facebook.com');
                    const isInstagram = cLower.includes('instagram.com');
                    const isYoutube = cLower.includes('youtube.com') || cLower.includes('youtu.be');
                    const isTwitch = cLower.includes('twitch.tv');
                    const isDiscord = cLower.includes('discord.gg') || cLower.includes('discord.com');
                    const isSlack = cLower.includes('slack.com');
                    const isScholar = cLower.includes('scholar.google.com');
                    const isDribbble = cLower.includes('dribbble.com');
                    const isFigma = cLower.includes('figma.com');
                    const isCP = cLower.includes('leetcode.com') || cLower.includes('codeforces.com') || cLower.includes('codechef.com') || cLower.includes('hackerrank.com') || cLower.includes('atcoder.jp');

                    let Icon = LinkIcon;
                    if (isTwitter) Icon = Twitter;
                    else if (isGithub) Icon = Github;
                    else if (isGitlab) Icon = Gitlab;
                    else if (isBitbucket) Icon = GitBranch;
                    else if (isLinkedin) Icon = Linkedin;
                    else if (isFacebook) Icon = Facebook;
                    else if (isInstagram) Icon = Instagram;
                    else if (isYoutube) Icon = Youtube;
                    else if (isTwitch) Icon = Twitch;
                    else if (isDiscord) Icon = MessageCircle;
                    else if (isSlack) Icon = Slack;
                    else if (isScholar) Icon = GraduationCap;
                    else if (isDribbble) Icon = Dribbble;
                    else if (isFigma) Icon = Figma;
                    else if (isCP) Icon = Code2;

                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="bg-muted p-1.5 rounded-md text-muted-foreground shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <a href={formatLinkHref(c)} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 hover:underline break-all truncate">
                          {formatLinkLabel(c)}
                        </a>
                      </div>
                    );
                  })
                ) : (
                  <span className="text-muted-foreground italic">-</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {isEditing ? (
            <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
              <div className="bg-muted px-4 py-3 border-b text-sm font-medium">
                Edit Profile Information
              </div>
              <div className="p-5 space-y-6">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Website / Profile URL</Label>
                  <Input
                    value={editForm.profile}
                    onChange={(e) => setEditForm({ ...editForm, profile: e.target.value })}
                    placeholder="https://yourwebsite.com"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Contact Information</Label>
                  <div className="space-y-2">
                    {editForm.contact.map((c, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={c}
                          placeholder="Email, Phone, etc."
                          onChange={(e) => {
                            const newC = [...editForm.contact];
                            newC[idx] = e.target.value;
                            setEditForm({ ...editForm, contact: newC });
                          }}
                        />
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditForm({ ...editForm, contact: editForm.contact.filter((_, i) => i !== idx) });
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setEditForm({ ...editForm, contact: [...editForm.contact, ""] })}>
                    <Plus className="w-4 h-4 mr-2" /> Add Contact
                  </Button>
                </div>

                <div className="space-y-3">
                  <Label>Social Links</Label>
                  <div className="space-y-2">
                    {editForm.socials.map((s, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={s}
                          placeholder="LinkedIn, Twitter, GitHub..."
                          onChange={(e) => {
                            const newS = [...editForm.socials];
                            newS[idx] = e.target.value;
                            setEditForm({ ...editForm, socials: newS });
                          }}
                        />
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditForm({ ...editForm, socials: editForm.socials.filter((_, i) => i !== idx) });
                        }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setEditForm({ ...editForm, socials: [...editForm.socials, ""] })}>
                    <Plus className="w-4 h-4 mr-2" /> Add Social Link
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <MarkdownEditor
                    value={editForm.description}
                    onChange={(val) => setEditForm({ ...editForm, description: val })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Markdown is supported.</p>
                </div>
              </div>
              <div className="bg-muted/50 px-5 py-4 border-t flex justify-end gap-3">
                <Button variant="outline" onClick={handleCancel} disabled={saving} className="w-24">
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="w-36">
                  {saving ? "Saving..." : <><Check className="w-4 h-4 mr-2" /> Save Profile</>}
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card border rounded-lg shadow-sm h-full flex flex-col overflow-hidden">
              <div className="bg-muted/30 px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-lg">About</h3>
              </div>
              <div className="p-6 flex-1">
                {setter.description ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {setter.description}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic text-center py-12">
                    No description provided yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

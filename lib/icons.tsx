/**
 * Icon layer: IconSax icons behind the familiar component names used
 * across the app. Each component forwards className to the IconSax svg
 * and fills its box, so existing Tailwind sizing (w-4 h-4 etc.) works.
 */
'use client'

import {
  Add as SaxAdd,
  AddSquare as SaxAddSquare,
  ArrowDown2 as SaxArrowDown2,
  ArrowLeft as SaxArrowLeft,
  ArrowLeft2 as SaxArrowLeft2,
  ArrowRight as SaxArrowRight,
  ArrowRight2 as SaxArrowRight2,
  ArrowUp2 as SaxArrowUp2,
  Bank as SaxBank,
  Call as SaxCall,
  CalendarTick as SaxCalendarTick,
  Camera as SaxCamera,
  Category as SaxCategory,
  Chart as SaxChart,
  Clock as SaxClock,
  CloseCircle as SaxCloseCircle,
  CloseSquare as SaxCloseSquare,
  Coin as SaxCoin,
  Copy as SaxCopy,
  Danger as SaxDanger,
  DirectInbox as SaxDirectInbox,
  Edit2 as SaxEdit2,
  Eye as SaxEye,
  EyeSlash as SaxEyeSlash,
  ExportSquare as SaxExportSquare,
  ArrowForward as SaxArrowForward,
  Flag as SaxFlag,
  GalleryExport as SaxGalleryExport,
  Gift as SaxGift,
  Cup as SaxCup,
  Global as SaxGlobal,
  Grid3 as SaxGrid3,
  Heart as SaxHeart,
  Home2 as SaxHome2,
  InfoCircle as SaxInfoCircle,
  LinkSquare as SaxLinkSquare,
  Lock as SaxLock,
  LogoutCurve as SaxLogoutCurve,
  MagicStar as SaxMagicStar,
  Maximize as SaxMaximize,
  Message as SaxMessage,
  Microphone as SaxMicrophone,
  MicrophoneSlash as SaxMicrophoneSlash,
  Mobile as SaxMobile,
  Moneys as SaxMoneys,
  Notepad2 as SaxNotepad2,
  Notification as SaxNotification,
  Play as SaxPlay,
  Pause as SaxPause,
  Profile as SaxProfile,
  ProfileAdd as SaxProfileAdd,
  ProfileRemove as SaxProfileRemove,
  Radio as SaxRadio,
  Crown1 as SaxCrown1,
  Book1 as SaxBook1,
  Personalcard as SaxPersonalcard,
  Airplane as SaxAirplane,
  Refresh as SaxRefresh,
  Save2 as SaxSave2,
  SearchNormal1 as SaxSearchNormal1,
  Send2 as SaxSend2,
  Setting2 as SaxSetting2,
  Shield as SaxShield,
  ShieldSecurity as SaxShieldSecurity,
  ShieldTick as SaxShieldTick,
  SliderHorizontal as SaxSliderHorizontal,
  Sms as SaxSms,
  Star as SaxStar,
  Tag as SaxTag,
  TaskSquare as SaxTaskSquare,
  Ticket as SaxTicket,
  TickCircle as SaxTickCircle,
  TickCircle as SaxCheckIcon,
  TickSquare as SaxTickSquare,
  Trash as SaxTrash,
  Verify as SaxVerify,
  Video as SaxVideo,
  Wallet as SaxWallet,
  Wifi as SaxWifi,
  WifiSquare as SaxWifiSquare,
} from 'iconsax-react'
import type { AriaAttributes, ComponentType } from 'react'

// AriaAttributes lets call sites pass aria-hidden (and the other
// standard aria props) so decorative icons inside labelled controls
// can be hidden from screen readers; the wrapper forwards them to
// the underlying svg.
type IconProps = {
  className?: string
  size?: number | string
  color?: string
  role?: string
} & AriaAttributes

function wrap(Sax: ComponentType<any>) {
  return function Icon({ className, ...rest }: IconProps) {
    return <Sax size="100%" variant="Linear" className={className} {...rest} />
  }
}

export const X = wrap(SaxCloseSquare)
export const Timer = wrap(SaxClock)
export const Radio = wrap(SaxRadio)
export const Crown = wrap(SaxCrown1)
export const BookOpen = wrap(SaxBook1)
export const IdCard = wrap(SaxPersonalcard)
export const Plane = wrap(SaxAirplane)
export const PenLine = wrap(SaxEdit2)
export const XCircle = wrap(SaxCloseCircle)
export const CheckCircle = wrap(SaxTickCircle)
export const CheckCircle2 = wrap(SaxTickCircle)
export const CheckCheck = wrap(SaxTickSquare)
export const Loader2 = wrap(SaxRefresh)
export const Spinner = wrap(SaxRefresh)
export const RefreshCw = wrap(SaxRefresh)
export const Plus = wrap(SaxAdd)
export const PlusSquare = wrap(SaxAddSquare)
export const Video = wrap(SaxVideo)
export const Phone = wrap(SaxCall)
export const PhoneOff = wrap(SaxCall)
export const Mic = wrap(SaxMicrophone)
export const MicOff = wrap(SaxMicrophoneSlash)
export const MessageCircle = wrap(SaxMessage)
export const Ticket = wrap(SaxTicket)
export const MapPin = wrap(SaxSearchNormal1)
export const LocationIcon = wrap(SaxSearchNormal1)
export const Coins = wrap(SaxCoin)
export const Chart = wrap(SaxChart)
export const Clock = wrap(SaxClock)
export const Trash2 = wrap(SaxTrash)
export const Heart = wrap(SaxHeart)
export const HeartIcon = wrap(SaxHeart)
export const ChevronRight = wrap(SaxArrowRight2)
export const ChevronLeft = wrap(SaxArrowLeft2)
export const ChevronDown = wrap(SaxArrowDown2)
export const ChevronUp = wrap(SaxArrowUp2)
export const ArrowLeft = wrap(SaxArrowLeft)
export const ArrowRight = wrap(SaxArrowRight)
export const ArrowUpRight = wrap(SaxArrowRight)
export const Calendar = wrap(SaxNotepad2)
export const CalendarCheck = wrap(SaxCalendarTick)
export const ClipboardList = wrap(SaxTaskSquare)
export const Banknote = wrap(SaxMoneys)
export const Wallet = wrap(SaxWallet)
export const Users = wrap(SaxProfile)
export const User = wrap(SaxProfile)
export const UserCheck = wrap(SaxProfileAdd)
export const UserX = wrap(SaxProfileRemove)
export const UserPlus = wrap(SaxProfileAdd)
export const Sparkles = wrap(SaxMagicStar)
export const ShieldCheck = wrap(SaxShieldTick)
export const Shield = wrap(SaxShield)
export const ShieldAlert = wrap(SaxShieldSecurity)
export const Settings = wrap(SaxSetting2)
export const Save = wrap(SaxSave2)
export const Mail = wrap(SaxSms)
export const LogOut = wrap(SaxLogoutCurve)
export const Lock = wrap(SaxLock)
export const Unlock = wrap(SaxLock)
export const LayoutDashboard = wrap(SaxCategory)
export const LayoutGrid = wrap(SaxGrid3)
export const Grid = wrap(SaxGrid3)
export const Info = wrap(SaxInfoCircle)
export const Gift = wrap(SaxGift)
export const Trophy = wrap(SaxCup)
export const Flag = wrap(SaxFlag)
export const Bell = wrap(SaxNotification)
export const BadgeCheck = wrap(SaxVerify)
export const Star = wrap(SaxStar)
export const Eye = wrap(SaxEye)
export const EyeOff = wrap(SaxEyeSlash)
export const ImageIcon = wrap(SaxGalleryExport)
export const Camera = wrap(SaxCamera)
export const Search = wrap(SaxSearchNormal1)
export const SearchX = wrap(SaxSearchNormal1)
export const Send = wrap(SaxSend2)
export const Share = wrap(SaxExportSquare)
export const Share2 = wrap(SaxExportSquare)
export const ShareForward = wrap(SaxArrowForward)
export const Play = wrap(SaxPlay)
export const Pause = wrap(SaxPause)
export const Wifi = wrap(SaxWifi)
export const WifiOff = wrap(SaxWifiSquare)
export const Compass = wrap(SaxMaximize)
export const Edit = wrap(SaxEdit2)
export const ExternalLink = wrap(SaxLinkSquare)
export const Filter = wrap(SaxSliderHorizontal)
export const Sliders = wrap(SaxSliderHorizontal)
export const Smartphone = wrap(SaxMobile)
export const Languages = wrap(SaxGlobal)
export const History = wrap(SaxClock)
export const List = wrap(SaxCategory)
export const ListChecks = wrap(SaxNotepad2)
export const AlertCircle = wrap(SaxInfoCircle)
export const AlertTriangle = wrap(SaxDanger)
export const Ban = wrap(SaxCloseCircle)
export const Home = wrap(SaxHome2)
export const Tag = wrap(SaxTag)
export const Inbox = wrap(SaxDirectInbox)
export const Bank = wrap(SaxBank)
export const Speaker = wrap(SaxRadio)
export const Check = wrap(SaxTickCircle)
export const Copy = wrap(SaxCopy)
export const Image = wrap(SaxGalleryExport)
export const Map = wrap(SaxSearchNormal1)
export const PictureInPicture2 = wrap(SaxMaximize)
export const SlidersHorizontal = wrap(SaxSliderHorizontal)
export const SwitchCamera = wrap(SaxRefresh)
export const VideoOff = wrap(SaxVideo)
export const Volume2 = wrap(SaxRadio)
export const Zap = wrap(SaxMagicStar)
